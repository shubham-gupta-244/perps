import type { Redis } from "./client";

export type StreamFields = Record<string, string>;

export class StreamProducer {
  constructor(
    private readonly client: Redis,
    private readonly stream: string,
  ) {}

  /** Append an entry, returning its stream id. */
  async add(fields: StreamFields): Promise<string> {
    return this.client.xAdd(this.stream, "*", fields);
  }

  /** Append with a bounded stream length (approximate trim). */
  async addCapped(fields: StreamFields, maxLen: number): Promise<string> {
    return this.client.xAdd(this.stream, "*", fields, {
      TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: maxLen },
    });
  }
}
