import { test, expect, beforeAll, afterAll } from "bun:test";
import {
  createRedis,
  ensureGroup,
  StreamProducer,
  StreamConsumer,
  ProcessedSet,
  readRange,
  type Redis,
} from "./index";

const URL = process.env.REDIS_URL ?? "redis://localhost:6379";
let client: Redis;
const ns = () => `test:${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  client = await createRedis(URL, "test");
});
afterAll(async () => {
  await client.destroy();
});

test("producer + consumer group: at-least-once, ack on success", async () => {
  const stream = ns();
  const group = "g1";
  const producer = new StreamProducer(client, stream);
  await producer.add({ data: "a" });
  await producer.add({ data: "b" });

  const seen: string[] = [];
  const consumer = new StreamConsumer({
    client,
    stream,
    group,
    consumer: "c1",
    blockMs: 100,
  });
  const done = consumer.start(async (msg) => {
    seen.push(msg.fields.data!);
    if (seen.length >= 2) consumer.stop();
  });
  await done;
  expect(seen.sort()).toEqual(["a", "b"]);

  const pending = (await client.xPending(stream, group)) as { pending: number };
  expect(pending.pending).toBe(0);
});

test("handler throw leaves message pending, retried on next pass", async () => {
  const stream = ns();
  const producer = new StreamProducer(client, stream);
  await producer.add({ data: "x" });

  let attempts = 0;
  const consumer = new StreamConsumer({
    client,
    stream,
    group: "g1",
    consumer: "c1",
    blockMs: 100,
    claimIdleMs: 0,
  });
  const done = consumer.start(async () => {
    attempts++;
    if (attempts < 3) throw new Error("boom");
    consumer.stop();
  });
  await done;
  expect(attempts).toBe(3);
});

test("message exceeding maxDeliveries is dead-lettered and acked", async () => {
  const stream = ns();
  const group = "g1";
  const dlq = ns();
  const producer = new StreamProducer(client, stream);
  await producer.add({ data: "poison" });

  const consumer = new StreamConsumer({
    client,
    stream,
    group,
    consumer: "c1",
    blockMs: 100,
    claimIdleMs: 0,
    maxDeliveries: 2,
    deadLetterStream: dlq,
  });
  let calls = 0;
  const done = consumer.start(async () => {
    calls++;
    if (calls > 10) consumer.stop();
    throw new Error("always fails");
  });
  // give it a moment then stop
  setTimeout(() => consumer.stop(), 2000);
  await done;

  const dlqEntries = await client.xLen(dlq);
  expect(dlqEntries).toBe(1);
  const pending = (await client.xPending(stream, group)) as { pending: number };
  expect(pending.pending).toBe(0);
});

test("XAUTOCLAIM reclaims messages from a dead consumer", async () => {
  const stream = ns();
  const group = "g1";
  await ensureGroup(client, stream, group);
  const producer = new StreamProducer(client, stream);
  await producer.add({ data: "orphan" });

  // dead consumer reads but never acks
  await client.xReadGroup(group, "dead", { key: stream, id: ">" }, { COUNT: 10 });

  const live = new StreamConsumer({
    client,
    stream,
    group,
    consumer: "live",
    blockMs: 100,
    claimIdleMs: 0,
  });
  let got = "";
  const done = live.start(async (msg) => {
    got = msg.fields.data!;
    live.stop();
  });
  await done;
  expect(got).toBe("orphan");
});

test("readRange yields entries in order after a given id", async () => {
  const stream = ns();
  const producer = new StreamProducer(client, stream);
  const id1 = await producer.add({ n: "1" });
  await producer.add({ n: "2" });
  await producer.add({ n: "3" });

  const collected: string[] = [];
  for await (const e of readRange(client, stream, id1)) collected.push(e.fields.n!);
  expect(collected).toEqual(["2", "3"]);
});

test("ProcessedSet dedupes and evicts", () => {
  const s = new ProcessedSet(2);
  expect(s.add("a")).toBe(true);
  expect(s.add("a")).toBe(false);
  s.add("b");
  s.add("c"); // evicts "a"
  expect(s.has("a")).toBe(false);
  expect(s.has("c")).toBe(true);
  expect(ProcessedSet.fromJSON(s.toJSON()).has("b")).toBe(true);
});
