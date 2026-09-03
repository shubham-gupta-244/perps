import type { EngineState, PriceLevel, RestingOrder } from "./state";
import type { Side } from "@repo/events";

/** Bids: highest price first. Asks: lowest price first. */
function levelsFor(state: EngineState, side: Side): PriceLevel[] {
  return side === "Bid" ? state.bids : state.asks;
}

function betterFirst(side: Side, a: number, b: number): boolean {
  return side === "Bid" ? a > b : a < b;
}

export function insertResting(state: EngineState, order: RestingOrder): void {
  const levels = levelsFor(state, order.side);
  let idx = levels.findIndex((l) => l.price === order.price);
  if (idx === -1) {
    let insertAt = levels.findIndex((l) => betterFirst(order.side, order.price, l.price));
    if (insertAt === -1) insertAt = levels.length;
    levels.splice(insertAt, 0, { price: order.price, orders: [] });
    idx = insertAt;
  }
  levels[idx]!.orders.push(order);
}

export function removeEmptyLevel(levels: PriceLevel[], price: number): void {
  const idx = levels.findIndex((l) => l.price === price);
  if (idx !== -1 && levels[idx]!.orders.length === 0) levels.splice(idx, 1);
}

export function cancelResting(
  state: EngineState,
  side: Side,
  price: number,
  orderId: string,
): RestingOrder | undefined {
  const levels = levelsFor(state, side);
  const level = levels.find((l) => l.price === price);
  if (!level) return undefined;
  const i = level.orders.findIndex((o) => o.orderId === orderId);
  if (i === -1) return undefined;
  const [removed] = level.orders.splice(i, 1);
  removeEmptyLevel(levels, price);
  return removed;
}

export function findResting(
  state: EngineState,
  orderId: string,
): RestingOrder | undefined {
  for (const levels of [state.bids, state.asks]) {
    for (const level of levels) {
      const o = level.orders.find((x) => x.orderId === orderId);
      if (o) return o;
    }
  }
  return undefined;
}

export interface BookSnapshot {
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  lastTradePrice: number;
}

export function snapshot(state: EngineState, levels = 20): BookSnapshot {
  const agg = (side: PriceLevel[]) =>
    side.slice(0, levels).map(
      (l) => [l.price, l.orders.reduce((s, o) => s + o.remaining, 0)] as [number, number],
    );
  return {
    bids: agg(state.bids),
    asks: agg(state.asks),
    lastTradePrice: state.lastTradePrice,
  };
}

export function bestPrice(state: EngineState, side: Side): number | undefined {
  return levelsFor(state, side)[0]?.price;
}
