/** Compare two redis stream ids ("<ms>-<seq>"). Returns <0, 0, >0. */
export function compareStreamIds(a: string, b: string): number {
  if (a === b) return 0;
  const [am, as] = a.split("-");
  const [bm, bs] = b.split("-");
  const ms = BigInt(am || "0") - BigInt(bm || "0");
  if (ms !== 0n) return ms < 0n ? -1 : 1;
  const ss = BigInt(as ?? "0") - BigInt(bs ?? "0");
  return ss === 0n ? 0 : ss < 0n ? -1 : 1;
}
