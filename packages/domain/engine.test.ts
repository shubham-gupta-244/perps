import { test, expect } from "bun:test";
import { Engine } from "./engine";
import { stableStringify, type MarketConfig } from "./state";
import { SCHEMA_VERSION, type EngineInputEvent } from "@repo/events";

const MARKET: MarketConfig = {
  symbol: "BTCUSDT",
  maxLeverage: 20,
  minMargin: 100,
  maintenanceMarginRate: 0.005,
};

let seq = 0;
function evt(
  partial: Pick<EngineInputEvent, "eventType" | "payload"> & Partial<EngineInputEvent>,
): EngineInputEvent {
  seq++;
  return {
    eventId: `in_${seq}`,
    ts: 1_700_000_000_000 + seq,
    source: "test",
    schemaVersion: SCHEMA_VERSION,
    ...partial,
  } as EngineInputEvent;
}

function user(userId: string, openingBalance = 1_000_000): EngineInputEvent {
  return evt({ eventType: "user.created", payload: { userId, openingBalance } });
}

function place(
  userId: string,
  orderId: string,
  side: "Bid" | "Ask",
  price: number,
  quantity: number,
  opts: { orderType?: "LIMIT" | "MARKET"; leverage?: number; margin?: number } = {},
): EngineInputEvent {
  const leverage = opts.leverage ?? 1;
  const margin = opts.margin ?? price * quantity;
  return evt({
    eventType: "order.place",
    commandId: `cmd_${orderId}`,
    payload: {
      userId,
      orderId,
      side,
      orderType: opts.orderType ?? "LIMIT",
      price,
      quantity,
      leverage,
      margin,
    },
  });
}

function apply(engine: Engine, events: EngineInputEvent[], startId = 0): void {
  events.forEach((e, i) => engine.process(e, { streamId: `${startId + i + 1}-0` }));
}

test("user.created seeds balance", () => {
  const e = Engine.create(MARKET);
  const out = e.process(user("u1", 500), { streamId: "1-0" });
  expect(e.state.balances.get("u1")).toEqual({ total: 500, free: 500, locked: 0 });
  expect(out.some((o) => o.eventType === "balance.updated")).toBe(true);
});

test("resting limit order locks margin and sits on the book", () => {
  const e = Engine.create(MARKET);
  apply(e, [user("u1"), place("u1", "o1", "Bid", 100, 10, { margin: 1000 })]);
  expect(e.state.balances.get("u1")).toMatchObject({ free: 999_000, locked: 1000 });
  expect(e.bookSnapshot().bids).toEqual([[100, 10]]);
});

test("crossing orders match, produce a trade and positions", () => {
  const e = Engine.create(MARKET);
  apply(e, [
    user("maker"),
    user("taker"),
    place("maker", "m1", "Ask", 100, 10, { margin: 1000 }),
    place("taker", "t1", "Bid", 100, 10, { margin: 1000 }),
  ]);
  expect(e.bookSnapshot().asks).toEqual([]);
  expect(e.state.positions.get("taker")!.size).toBe(10);
  expect(e.state.positions.get("maker")!.size).toBe(-10);
  expect(e.state.lastTradePrice).toBe(100);
});

test("partial fill leaves remainder resting", () => {
  const e = Engine.create(MARKET);
  apply(e, [
    user("maker"),
    user("taker"),
    place("maker", "m1", "Ask", 100, 4, { margin: 400 }),
    place("taker", "t1", "Bid", 100, 10, { margin: 1000 }),
  ]);
  const accepted = e
    .process(place("taker", "t2", "Bid", 100, 0.000001, { margin: 100 }), { streamId: "99-0" })
    .find((o) => o.eventType === "order.accepted");
  expect(e.bookSnapshot().bids[0]?.[0]).toBe(100);
  expect(e.state.positions.get("taker")!.size).toBe(4);
});

test("market order with empty book is cancelled and margin released", () => {
  const e = Engine.create(MARKET);
  apply(e, [user("u1")]);
  const out = e.process(
    place("u1", "o1", "Bid", 0, 5, { orderType: "MARKET", margin: 1000 }),
    { streamId: "2-0" },
  );
  const acc = out.find((o) => o.eventType === "order.accepted");
  expect((acc as any).payload.status).toBe("CANCELLED");
  expect(e.state.balances.get("u1")).toMatchObject({ locked: 0, free: 1_000_000 });
});

test("cancel releases locked margin", () => {
  const e = Engine.create(MARKET);
  apply(e, [user("u1"), place("u1", "o1", "Bid", 100, 10, { margin: 1000 })]);
  e.process(
    evt({ eventType: "order.cancel", commandId: "c_cancel", payload: { userId: "u1", orderId: "o1", side: "Bid", price: 100 } }),
    { streamId: "3-0" },
  );
  expect(e.state.balances.get("u1")).toMatchObject({ locked: 0, free: 1_000_000 });
  expect(e.bookSnapshot().bids).toEqual([]);
});

test("invalid commands are rejected without mutating balances", () => {
  const e = Engine.create(MARKET);
  apply(e, [user("u1", 50)]);
  const out = e.process(place("u1", "o1", "Bid", 100, 10, { margin: 1000 }), { streamId: "2-0" });
  expect(out.some((o) => o.eventType === "order.rejected")).toBe(true);
  expect(e.state.balances.get("u1")).toMatchObject({ locked: 0, free: 50 });
});

test("duplicate command (same commandId) is a no-op", () => {
  const e = Engine.create(MARKET);
  apply(e, [user("u1")]);
  const cmd = place("u1", "o1", "Bid", 100, 10, { margin: 1000 });
  e.process(cmd, { streamId: "2-0" });
  const before = stableStringify(e.state);
  const secondOut = e.process(cmd, { streamId: "3-0" });
  // state unchanged except lastInputId
  expect({ ...JSON.parse(stableStringify(e.state)), lastInputId: "x" }).toEqual({
    ...JSON.parse(before),
    lastInputId: "x",
  });
  expect(secondOut).toEqual([]);
});

test("index price drives liquidation of an underwater long", () => {
  const e = Engine.create(MARKET);
  apply(e, [
    user("maker"),
    user("taker"),
    place("maker", "m1", "Ask", 100, 10, { margin: 100, leverage: 10 }),
    place("taker", "t1", "Bid", 100, 10, { margin: 100, leverage: 10 }),
  ]);
  const out = e.process(
    evt({ eventType: "index_price.updated", payload: { symbol: "BTCUSDT", price: 80, observerSeq: 1, sourceTs: 1 } }),
    { streamId: "9-0" },
  );
  expect(out.some((o) => o.eventType === "position.liquidated")).toBe(true);
  expect(e.state.positions.get("taker")!.size).toBe(0);
});

test("stale observer sequence is ignored", () => {
  const e = Engine.create(MARKET);
  apply(e, [user("u1")]);
  e.process(evt({ eventType: "index_price.updated", payload: { symbol: "BTCUSDT", price: 100, observerSeq: 5, sourceTs: 1 } }), { streamId: "2-0" });
  e.process(evt({ eventType: "index_price.updated", payload: { symbol: "BTCUSDT", price: 50, observerSeq: 3, sourceTs: 2 } }), { streamId: "3-0" });
  expect(e.state.markPrice).toBe(100);
});

test("MANDATED: snapshot after C + replay D E == process A B C D E", () => {
  const events = [
    user("maker"),
    user("taker"),
    place("maker", "m1", "Ask", 100, 10, { margin: 1000 }), // A
    place("taker", "t1", "Bid", 100, 6, { margin: 600 }), // B
    place("maker", "m2", "Ask", 101, 5, { margin: 505 }), // C
    place("taker", "t2", "Bid", 101, 5, { margin: 505 }), // D
    evt({ eventType: "index_price.updated", payload: { symbol: "BTCUSDT", price: 100, observerSeq: 1, sourceTs: 1 } }), // E
  ];

  const direct = Engine.create(MARKET);
  apply(direct, events);

  const partial = Engine.create(MARKET);
  apply(partial, events.slice(0, 5)); // through C
  const snap = JSON.parse(JSON.stringify(partial.snapshot()));

  const restored = Engine.fromSnapshot(snap);
  events.slice(5).forEach((ev, i) => restored.process(ev, { streamId: `${6 + i}-0` }));

  expect(stableStringify(restored.state)).toEqual(stableStringify(direct.state));
});
