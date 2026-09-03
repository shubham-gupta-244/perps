import type { Balance, EngineState } from "./state";
import { q } from "./money";

export function getBalance(state: EngineState, userId: string): Balance | undefined {
  return state.balances.get(userId);
}

export function ensureBalance(state: EngineState, userId: string): Balance {
  let b = state.balances.get(userId);
  if (!b) {
    b = { total: 0, free: 0, locked: 0 };
    state.balances.set(userId, b);
  }
  return b;
}

export function credit(state: EngineState, userId: string, amount: number): void {
  const b = ensureBalance(state, userId);
  b.total = q(b.total + amount);
  b.free = q(b.free + amount);
}

/** Move `amount` from free to locked. Returns false if insufficient free. */
export function lock(state: EngineState, userId: string, amount: number): boolean {
  const b = ensureBalance(state, userId);
  if (b.free + 1e-6 < amount) return false;
  b.free = q(b.free - amount);
  b.locked = q(b.locked + amount);
  return true;
}

/** Move up to `amount` from locked back to free (clamped at available locked). */
export function release(state: EngineState, userId: string, amount: number): number {
  const b = ensureBalance(state, userId);
  const moved = Math.min(b.locked, Math.max(0, amount));
  b.locked = q(b.locked - moved);
  b.free = q(b.free + moved);
  return moved;
}

/** Apply realised PnL to total + free (may be negative). */
export function applyPnl(state: EngineState, userId: string, pnl: number): void {
  const b = ensureBalance(state, userId);
  b.total = q(b.total + pnl);
  b.free = q(b.free + pnl);
}
