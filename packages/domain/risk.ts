import { q } from "./money";

export const DEFAULT_MMR = 0.005;

export function notional(price: number, quantity: number): number {
  return q(price * quantity);
}

export function requiredMargin(
  price: number,
  quantity: number,
  leverage: number,
): number {
  if (leverage <= 0) return Infinity;
  return q(notional(price, quantity) / leverage);
}

export function computeLiquidationPrice(
  entryPrice: number,
  leverage: number,
  side: "LONG" | "SHORT",
  mmr = DEFAULT_MMR,
): number {
  if (leverage <= 0) return 0;
  if (side === "LONG") return q(Math.max(0, entryPrice * (1 - 1 / leverage + mmr)));
  return q(entryPrice * (1 + 1 / leverage - mmr));
}

export function isLiquidatable(
  markPrice: number,
  liqPrice: number,
  side: "LONG" | "SHORT",
): boolean {
  if (liqPrice <= 0) return false;
  return side === "LONG" ? markPrice <= liqPrice : markPrice >= liqPrice;
}
