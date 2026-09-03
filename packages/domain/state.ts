import type { Side } from "@repo/events";

export interface Balance {
  total: number;
  free: number;
  locked: number;
}

export interface RestingOrder {
  orderId: string;
  userId: string;
  side: Side;
  price: number;
  quantity: number;
  remaining: number;
  leverage: number;
  /** Collateral still locked for the unfilled remainder of this order. */
  margin: number;
  /** Engine sequence at insertion — gives deterministic time priority. */
  seq: number;
  ts: number;
}

export interface PriceLevel {
  price: number;
  orders: RestingOrder[];
}

export interface Position {
  userId: string;
  /** +long / -short, 0 = flat. */
  size: number;
  entryPrice: number;
  margin: number;
  leverage: number;
  liqPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  markPrice: number;
}

export interface MarketConfig {
  symbol: string;
  maxLeverage: number;
  minMargin: number;
  maintenanceMarginRate: number;
}

/**
 * The complete engine state. Everything needed to answer any query and to
 * resume after a crash lives here and is captured by `serialize()`.
 */
export interface EngineState {
  market: MarketConfig;
  markPrice: number;
  lastTradePrice: number;

  balances: Map<string, Balance>;
  positions: Map<string, Position>;
  bids: PriceLevel[];
  asks: PriceLevel[];

  /** Monotonic engine counter — source of every deterministic id. */
  seq: number;
  /** Redis stream id of the last input event folded into this state. */
  lastInputId: string;
  /** Applied event count since genesis (for snapshot cadence). */
  appliedCount: number;
  /** Idempotency: commandIds already applied (bounded, newest last). */
  appliedCommandIds: string[];
  /** Highest observer sequence seen — drops stale/duplicate index prices. */
  lastObserverSeq: number;
}

export function createState(market: MarketConfig): EngineState {
  return {
    market,
    markPrice: 0,
    lastTradePrice: 0,
    balances: new Map(),
    positions: new Map(),
    bids: [],
    asks: [],
    seq: 0,
    lastInputId: "0",
    appliedCount: 0,
    appliedCommandIds: [],
    lastObserverSeq: -1,
  };
}

/* ------------------------------ serialization ----------------------------- */

export interface SerializedState {
  version: number;
  market: MarketConfig;
  markPrice: number;
  lastTradePrice: number;
  balances: Array<[string, Balance]>;
  positions: Array<[string, Position]>;
  bids: PriceLevel[];
  asks: PriceLevel[];
  seq: number;
  lastInputId: string;
  appliedCount: number;
  appliedCommandIds: string[];
  lastObserverSeq: number;
}

export const STATE_VERSION = 1;

export function serialize(state: EngineState): SerializedState {
  return {
    version: STATE_VERSION,
    market: state.market,
    markPrice: state.markPrice,
    lastTradePrice: state.lastTradePrice,
    balances: [...state.balances.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    positions: [...state.positions.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    bids: state.bids,
    asks: state.asks,
    seq: state.seq,
    lastInputId: state.lastInputId,
    appliedCount: state.appliedCount,
    appliedCommandIds: state.appliedCommandIds,
    lastObserverSeq: state.lastObserverSeq,
  };
}

export function deserialize(s: SerializedState): EngineState {
  if (s.version !== STATE_VERSION) {
    throw new Error(`snapshot state version ${s.version} != supported ${STATE_VERSION}`);
  }
  return {
    market: s.market,
    markPrice: s.markPrice,
    lastTradePrice: s.lastTradePrice,
    balances: new Map(s.balances),
    positions: new Map(s.positions),
    bids: s.bids,
    asks: s.asks,
    seq: s.seq,
    lastInputId: s.lastInputId,
    appliedCount: s.appliedCount,
    appliedCommandIds: s.appliedCommandIds,
    lastObserverSeq: s.lastObserverSeq,
  };
}

/** Stable JSON for equality assertions in tests and integrity hashing. */
export function stableStringify(state: EngineState): string {
  return JSON.stringify(serialize(state));
}
