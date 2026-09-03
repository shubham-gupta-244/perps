import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRedis, StreamProducer, type Redis } from "@repo/redis-streams";
import { encodeEvent, newEventId, SCHEMA_VERSION, decodeOutputEvent, type EngineInputEvent } from "@repo/events";
import { STREAMS, GROUPS } from "@repo/config";
import prisma from "@repo/db";
import { SnapshotStore } from "../engine/src/snapshot";
import { EngineRuntime } from "../engine/src/runtime";
import { project } from "../db-Writer/src/projector";
import { StreamConsumer } from "@repo/redis-streams";

const URL = process.env.REDIS_URL ?? "redis://localhost:6379";
let redis: Redis;
let input: StreamProducer;

beforeAll(async () => {
  redis = await createRedis(URL, "e2e");
});
afterAll(async () => {
  await Promise.allSettled(spawned.map((c) => c.destroy()));
  await redis.destroy();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await redis.flushDb();
  input = new StreamProducer(redis, STREAMS.input);
  await prisma.processedEvent.deleteMany({});
  await prisma.fills.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.position.deleteMany({});
  await prisma.wallet.deleteMany({});
  await prisma.user.deleteMany({});
});

let s = 0;
function ev(p: Pick<EngineInputEvent, "eventType" | "payload"> & Partial<EngineInputEvent>): EngineInputEvent {
  s++;
  return { eventId: newEventId(), ts: 1_700_000_000_000 + s, source: "e2e", schemaVersion: SCHEMA_VERSION, ...p } as EngineInputEvent;
}

async function makeUser(username: string) {
  const u = await prisma.user.create({
    data: { username, password: "x", wallet: { create: { balance: 0, freeBalance: 0, lockedBalance: 0 } } },
  });
  await input.add(encodeEvent(ev({ eventType: "user.created", commandId: `u-${u.id}`, payload: { userId: u.id, openingBalance: 1_000_000 } })));
  await prisma.wallet.update({ where: { userId: u.id }, data: { balance: 1_000_000, freeBalance: 1_000_000 } });
  return u.id;
}

const spawned: Redis[] = [];
async function conn(name: string): Promise<Redis> {
  const c = await createRedis(URL, name);
  spawned.push(c);
  return c;
}

async function newRuntime() {
  const dir = await mkdtemp(join(tmpdir(), "e2e-"));
  const store = new SnapshotStore(dir, 3);
  const [i, o, q] = await Promise.all([conn("rt-in"), conn("rt-out"), conn("rt-q")]);
  return { rt: new EngineRuntime({ input: i, output: o, query: q, store }), store };
}

async function startPoller() {
  const consumer = new StreamConsumer({
    client: await conn("poller"),
    stream: STREAMS.output,
    group: GROUPS.dbPoller,
    consumer: "e2e-poller",
    blockMs: 100,
  });
  void consumer.start(async (msg) => {
    await project(decodeOutputEvent(msg.fields), msg.id);
  });
  return consumer;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("client -> input stream -> engine -> output stream -> db projection", async () => {
  const { rt } = await newRuntime();
  await rt.recover();
  const poller = await startPoller();
  void rt.runLive();
  await wait(200);

  const maker = await makeUser("maker");
  const taker = await makeUser("taker");
  await wait(300);

  const makerOrder = await prisma.order.create({
    data: { walletId: (await prisma.wallet.findUniqueOrThrow({ where: { userId: maker } })).id, commandId: "cmd-m1", orderType: "LIMIT", side: "ASK", quantity: 10, price: 100, leverage: 1, liquidationPrice: 0, lockedBalance: 1000, status: "PENDING" },
  });
  const takerOrder = await prisma.order.create({
    data: { walletId: (await prisma.wallet.findUniqueOrThrow({ where: { userId: taker } })).id, commandId: "cmd-t1", orderType: "LIMIT", side: "BID", quantity: 6, price: 100, leverage: 1, liquidationPrice: 0, lockedBalance: 600, status: "PENDING" },
  });

  await input.add(encodeEvent(ev({ eventType: "order.place", commandId: "cmd-m1", payload: { userId: maker, orderId: makerOrder.id, side: "Ask", orderType: "LIMIT", price: 100, quantity: 10, leverage: 1, margin: 1000 } })));
  await input.add(encodeEvent(ev({ eventType: "order.place", commandId: "cmd-t1", payload: { userId: taker, orderId: takerOrder.id, side: "Bid", orderType: "LIMIT", price: 100, quantity: 6, leverage: 1, margin: 600 } })));

  await wait(2000);

  expect(rt.engine.state.positions.get(taker)!.size).toBe(6);

  const dbTaker = await prisma.order.findUniqueOrThrow({ where: { id: takerOrder.id } });
  expect(dbTaker.status).toBe("FILLED");
  expect(dbTaker.filledQuantity).toBe(6);
  const dbMaker = await prisma.order.findUniqueOrThrow({ where: { id: makerOrder.id } });
  expect(dbMaker.status).toBe("PARTIALLYFILLED");

  const fills = await prisma.fills.findMany();
  expect(fills.length).toBe(1);
  expect(fills[0]!.quantity).toBe(6);

  const pos = await prisma.position.findUniqueOrThrow({ where: { userId: taker } });
  expect(pos.size).toBe(6);

  poller.stop();
  await rt.stop();
});

test("engine rebuilds identical state from snapshot + replay after a crash", async () => {
  const u = await makeUser("solo");
  const o = await prisma.order.create({
    data: { walletId: (await prisma.wallet.findUniqueOrThrow({ where: { userId: u } })).id, commandId: "c-o", orderType: "LIMIT", side: "BID", quantity: 5, price: 90, leverage: 1, liquidationPrice: 0, lockedBalance: 450, status: "PENDING" },
  });
  await input.add(encodeEvent(ev({ eventType: "order.place", commandId: "c-o", payload: { userId: u, orderId: o.id, side: "Bid", orderType: "LIMIT", price: 90, quantity: 5, leverage: 1, margin: 450 } })));

  const first = await newRuntime();
  await first.rt.recover();
  void first.rt.runLive();
  await wait(800);
  const before = JSON.stringify({ ...first.rt.engine.snapshot(), lastInputId: "X" });
  await first.rt.stop(); // writes a final snapshot

  // more events arrive while the engine is down
  await input.add(encodeEvent(ev({ eventType: "index_price.updated", payload: { symbol: "BTCUSDT", price: 95, observerSeq: 1, sourceTs: 1 } })));

  const [i2, o2, q2] = await Promise.all([conn("rt2-in"), conn("rt2-out"), conn("rt2-q")]);
  const second = new EngineRuntime({ input: i2, output: o2, query: q2, store: first.store });
  await second.recover();
  expect(second.engine.state.balances.get(u)!.locked).toBe(450);
  expect(second.engine.state.markPrice).toBe(95);
  await second.stop();
});
