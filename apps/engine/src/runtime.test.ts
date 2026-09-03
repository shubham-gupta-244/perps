import { test, expect, beforeEach, afterAll } from "bun:test";
import { mkdtemp, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRedis, StreamProducer, type Redis } from "@repo/redis-streams";
import { encodeEvent, SCHEMA_VERSION, type EngineInputEvent } from "@repo/events";
import { STREAMS } from "@repo/config";
import { serialize } from "@repo/domain";
import { SnapshotStore } from "./snapshot";
import { EngineRuntime } from "./runtime";

const URL = process.env.REDIS_URL ?? "redis://localhost:6379";
let redis: Redis;

beforeEach(async () => {
  redis = redis ?? (await createRedis(URL, "engine-test"));
  await redis.flushDb();
});
afterAll(async () => {
  await redis.destroy();
});

let n = 0;
function inputEvent(p: Pick<EngineInputEvent, "eventType" | "payload"> & Partial<EngineInputEvent>): EngineInputEvent {
  n++;
  return { eventId: `in_${n}`, ts: 1_700_000_000_000 + n, source: "test", schemaVersion: SCHEMA_VERSION, ...p } as EngineInputEvent;
}

async function seed(events: EngineInputEvent[]): Promise<void> {
  const p = new StreamProducer(redis, STREAMS.input);
  for (const e of events) await p.add(encodeEvent(e));
}

async function newRuntime() {
  const dir = await mkdtemp(join(tmpdir(), "eng-"));
  const store = new SnapshotStore(dir, 3);
  const rt = new EngineRuntime({ input: redis, output: redis, query: redis, store });
  return { rt, dir, store };
}

const events: EngineInputEvent[] = [
  inputEvent({ eventType: "user.created", commandId: "c1", payload: { userId: "maker", openingBalance: 1_000_000 } }),
  inputEvent({ eventType: "user.created", commandId: "c2", payload: { userId: "taker", openingBalance: 1_000_000 } }),
  inputEvent({ eventType: "order.place", commandId: "c3", payload: { userId: "maker", orderId: "m1", side: "Ask", orderType: "LIMIT", price: 100, quantity: 10, leverage: 1, margin: 1000 } }),
  inputEvent({ eventType: "order.place", commandId: "c4", payload: { userId: "taker", orderId: "t1", side: "Bid", orderType: "LIMIT", price: 100, quantity: 4, leverage: 1, margin: 400 } }),
  inputEvent({ eventType: "index_price.updated", payload: { symbol: "BTCUSDT", price: 100, observerSeq: 1, sourceTs: 1 } }),
];

test("recover replays the whole input log from genesis", async () => {
  await seed(events);
  const { rt } = await newRuntime();
  await rt.recover();
  expect(rt.engine.state.positions.get("taker")!.size).toBe(4);
  expect(rt.engine.state.appliedCount).toBe(5);
});

test("snapshot + partial replay == full replay", async () => {
  // full replay of all 5
  await seed(events);
  const full = await newRuntime();
  await full.rt.recover();
  const norm = (s: any) => JSON.stringify({ ...serialize(s), lastInputId: "X" });
  const expected = norm(full.rt.engine.state);
  await redis.flushDb();

  // seed first 3, recover + snapshot, then seed the remaining 2 and recover fresh
  await seed(events.slice(0, 3));
  const mid = await newRuntime();
  await mid.rt.recover();
  await mid.store.save(mid.rt.engine.snapshot());

  await seed(events.slice(3));
  const resumed = new EngineRuntime({ input: redis, output: redis, query: redis, store: mid.store });
  await resumed.recover();
  expect(resumed.engine.state.appliedCount).toBe(5);
  expect(norm(resumed.engine.state)).toEqual(expected);
});

test("corrupt newest snapshot falls back to previous valid one", async () => {
  const { store, dir } = await newRuntime();
  const rt1 = new EngineRuntime({ input: redis, output: redis, query: redis, store });
  rt1.engine.process(events[0]!, { streamId: "1-0" });
  await store.save(rt1.engine.snapshot());
  rt1.engine.process(events[1]!, { streamId: "2-0" });
  await store.save(rt1.engine.snapshot());

  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  await writeFile(join(dir, files[files.length - 1]!), "{ corrupt", "utf8");

  const loaded = await store.loadLatest();
  expect(loaded).not.toBeNull();
  expect(loaded!.state.appliedCount).toBe(1); // the earlier, valid snapshot
});
