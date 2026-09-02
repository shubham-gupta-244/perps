export const MAINTENANCE_MARGIN_RATE = 0.005;

export function computeLiquidationPrice(
  entryPrice: number,
  leverage: number,
  side: "LONG" | "SHORT",
  mmr: number = MAINTENANCE_MARGIN_RATE,
): number {
  if (leverage <= 0) return 0;
  if (side === "LONG") {
    return Math.max(0, entryPrice * (1 - 1 / leverage + mmr));
  }
  return entryPrice * (1 + 1 / leverage - mmr);
}

export function isLiquidatable(
  markPrice: number,
  liqPrice: number,
  side: "LONG" | "SHORT",
): boolean {
  if (liqPrice <= 0 && side === "LONG") return false;
  return side === "LONG" ? markPrice <= liqPrice : markPrice >= liqPrice;
}
