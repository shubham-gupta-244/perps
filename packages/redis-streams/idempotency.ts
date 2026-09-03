/**
 * Bounded in-memory set of already-processed ids.
 *
 * Suitable for a single-process consumer (the engine) where the authoritative
 * record is also persisted in the snapshot. Consumers whose state is not
 * snapshotted (db-poller) should use a durable store instead.
 */
export class ProcessedSet {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly max = 100_000) {}

  has(id: string): boolean {
    return this.seen.has(id);
  }

  /** Returns true if this id is new (and records it), false if already seen. */
  add(id: string): boolean {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.order.push(id);
    if (this.order.length > this.max) {
      const evicted = this.order.shift();
      if (evicted !== undefined) this.seen.delete(evicted);
    }
    return true;
  }

  toJSON(): string[] {
    return [...this.order];
  }

  static fromJSON(ids: string[], max?: number): ProcessedSet {
    const s = new ProcessedSet(max);
    for (const id of ids) s.add(id);
    return s;
  }
}
