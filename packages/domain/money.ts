/**
 * All monetary/price/quantity values are plain numbers by project decision.
 * Inputs are expected to be integers (minor units); internal arithmetic
 * (weighted average entry price, PnL) can produce fractions.
 *
 * `q` rounds to a fixed precision so that repeated replay of the same event
 * sequence produces bit-identical state regardless of accumulation order noise.
 */
const SCALE = 1e8;

export function q(n: number): number {
  return Math.round(n * SCALE) / SCALE;
}

export function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}
