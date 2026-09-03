import { test, expect } from "bun:test";
import {
  encodeEvent,
  decodeInputEvent,
  decodeOutputEvent,
  EventDecodeError,
  newEventId,
  SCHEMA_VERSION,
  type PlaceOrderCommandEvent,
} from "./index";

function placeOrder(): PlaceOrderCommandEvent {
  return {
    eventId: newEventId(),
    eventType: "order.place",
    ts: 1_700_000_000_000,
    source: "api",
    schemaVersion: SCHEMA_VERSION,
    commandId: "cmd-1",
    payload: {
      userId: "u1",
      orderId: "o1",
      side: "Bid",
      orderType: "LIMIT",
      quantity: 5,
      price: 100,
      leverage: 10,
      margin: 50,
    },
  };
}

test("input event round-trips through encode/decode", () => {
  const evt = placeOrder();
  const decoded = decodeInputEvent(encodeEvent(evt));
  expect(decoded).toEqual(evt);
});

test("flat fields are populated for filtering", () => {
  const fields = encodeEvent(placeOrder());
  expect(fields.eventType).toBe("order.place");
  expect(fields.commandId).toBe("cmd-1");
  expect(typeof fields.data).toBe("string");
});

test("output event round-trips", () => {
  const evt = {
    eventId: newEventId(),
    eventType: "trade.executed" as const,
    ts: 1,
    source: "engine",
    schemaVersion: SCHEMA_VERSION,
    payload: {
      tradeId: "t1",
      symbol: "BTCUSDT",
      makerOrderId: "m1",
      takerOrderId: "t1",
      makerUserId: "u1",
      takerUserId: "u2",
      price: 100,
      quantity: 3,
      takerSide: "Bid" as const,
      ts: 1,
    },
  };
  expect(decodeOutputEvent(encodeEvent(evt))).toEqual(evt);
});

test("rejects malformed JSON", () => {
  expect(() => decodeInputEvent({ data: "{not json" })).toThrow(EventDecodeError);
});

test("rejects missing data field", () => {
  expect(() => decodeInputEvent({ eventType: "x" })).toThrow(EventDecodeError);
});

test("rejects unknown event type", () => {
  const bad = { ...placeOrder(), eventType: "order.teleport" };
  expect(() => decodeInputEvent({ data: JSON.stringify(bad) })).toThrow(
    EventDecodeError,
  );
});

test("rejects schema from the future", () => {
  const future = { ...placeOrder(), schemaVersion: SCHEMA_VERSION + 1 };
  expect(() => decodeInputEvent({ data: JSON.stringify(future) })).toThrow(
    /newer than supported/,
  );
});

test("rejects payload that violates constraints", () => {
  const evt = placeOrder();
  evt.payload.quantity = -1;
  expect(() => decodeInputEvent(encodeEvent(evt))).toThrow(EventDecodeError);
});
