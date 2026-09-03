import type { EngineState, Position } from "./state";
import { q, sign } from "./money";
import { applyPnl, release } from "./balances";
import { computeLiquidationPrice, isLiquidatable } from "./risk";

export function getPosition(state: EngineState, userId: string): Position | undefined {
  return state.positions.get(userId);
}

export function ensurePosition(state: EngineState, userId: string): Position {
  let p = state.positions.get(userId);
  if (!p) {
    p = {
      userId,
      size: 0,
      entryPrice: 0,
      margin: 0,
      leverage: 1,
      liqPrice: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      markPrice: state.markPrice,
    };
    state.positions.set(userId, p);
  }
  return p;
}

function refreshLiq(state: EngineState, p: Position): void {
  if (p.size === 0) {
    p.liqPrice = 0;
    return;
  }
  p.liqPrice = computeLiquidationPrice(
    p.entryPrice,
    p.leverage,
    p.size > 0 ? "LONG" : "SHORT",
    state.market.maintenanceMarginRate,
  );
}

/**
 * Fold a single fill leg into a user's position.
 *
 * `fillMargin` is the collateral share of the filling order allocated to this
 * fill quantity. Collateral that ends up not backing an open position is
 * released back to the user's free balance immediately.
 */
export function applyFill(
  state: EngineState,
  userId: string,
  side: "Bid" | "Ask",
  price: number,
  fillQty: number,
  fillMargin: number,
  leverage: number,
): void {
  const p = ensurePosition(state, userId);
  const signed = side === "Bid" ? fillQty : -fillQty;

  if (p.size === 0) {
    p.size = signed;
    p.entryPrice = price;
    p.margin = q(fillMargin);
    p.leverage = leverage;
    refreshLiq(state, p);
    return;
  }

  if (sign(p.size) === sign(signed)) {
    const absOld = Math.abs(p.size);
    const newAbs = absOld + fillQty;
    p.entryPrice = q((absOld * p.entryPrice + fillQty * price) / newAbs);
    p.size = q(p.size + signed);
    p.margin = q(p.margin + fillMargin);
    p.leverage = leverage;
    refreshLiq(state, p);
    return;
  }

  // opposing fill: reduce / close / flip
  const absPos = Math.abs(p.size);
  const absTrade = fillQty;
  const closedQty = Math.min(absPos, absTrade);
  const dir = p.size > 0 ? 1 : -1;
  const pnl = q((price - p.entryPrice) * closedQty * dir);

  const marginFreed = q((closedQty / absPos) * p.margin);
  release(state, userId, marginFreed);
  applyPnl(state, userId, pnl);
  p.realizedPnl = q(p.realizedPnl + pnl);
  p.margin = q(p.margin - marginFreed);
  p.size = q(p.size + signed);

  const closedPortionFillMargin = q((closedQty / absTrade) * fillMargin);
  release(state, userId, closedPortionFillMargin);

  if (Math.abs(p.size) < 1e-9) {
    release(state, userId, p.margin);
    p.size = 0;
    p.entryPrice = 0;
    p.margin = 0;
    p.liqPrice = 0;
    return;
  }

  if (absTrade > absPos) {
    // flipped onto the other side with the leftover quantity
    p.entryPrice = price;
    p.margin = q(fillMargin - closedPortionFillMargin);
    p.leverage = leverage;
  }
  refreshLiq(state, p);
}

export function markToMarket(state: EngineState, markPrice: number): void {
  state.markPrice = markPrice;
  for (const p of state.positions.values()) {
    p.markPrice = markPrice;
    p.unrealizedPnl = p.size === 0 ? 0 : q((markPrice - p.entryPrice) * p.size);
  }
}

export interface Liquidation {
  userId: string;
  markPrice: number;
  realizedPnl: number;
}

/** Force-close every position that is underwater at `markPrice`. */
export function liquidationSweep(state: EngineState, markPrice: number): Liquidation[] {
  const out: Liquidation[] = [];
  for (const p of state.positions.values()) {
    if (p.size === 0) continue;
    const posSide = p.size > 0 ? "LONG" : "SHORT";
    if (!isLiquidatable(markPrice, p.liqPrice, posSide)) continue;

    const pnl = q((markPrice - p.entryPrice) * p.size);
    release(state, p.userId, p.margin);
    applyPnl(state, p.userId, pnl);
    p.realizedPnl = q(p.realizedPnl + pnl);
    p.size = 0;
    p.entryPrice = 0;
    p.margin = 0;
    p.liqPrice = 0;
    p.unrealizedPnl = 0;
    out.push({ userId: p.userId, markPrice, realizedPnl: pnl });
  }
  return out;
}
