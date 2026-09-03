import type { Redis } from "./client";
import type { StreamFields } from "./producer";

export interface RangeEntry {
  id: string;
  fields: StreamFields;
}

/**
 * Iterate a stream in order, from `afterId` (exclusive) to the current tail.
 * Used by the engine to replay the input log after loading a snapshot.
 */
export async function* readRange(
  client: Redis,
  stream: string,
  afterId = "0",
  pageSize = 500,
): AsyncGenerator<RangeEntry> {
  let start = afterId === "0" ? "-" : `(${afterId}`;
  while (true) {
    const page = (await client.xRange(stream, start, "+", { COUNT: pageSize })) as Array<{
      id: string;
      message: StreamFields;
    }>;
    if (page.length === 0) return;
    for (const entry of page) yield { id: entry.id, fields: entry.message };
    const last = page[page.length - 1]!;
    start = `(${last.id}`;
    if (page.length < pageSize) return;
  }
}

export async function streamLength(client: Redis, stream: string): Promise<number> {
  return client.xLen(stream);
}
