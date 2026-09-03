import { createRedis, StreamProducer, type Redis } from "@repo/redis-streams";
import { STREAMS, config } from "@repo/config";
import { createLogger } from "@repo/logger";
import {
  encodeEvent,
  decodeOutputEvent,
  newEventId,
  SCHEMA_VERSION,
  engineInputEventSchema,
  engineQueryReplySchema,
  type EngineInputEvent,
  type EngineOutputEvent,
  type EngineOutputEventType,
} from "@repo/events";

export type QueryInput =
  | { type: "get_balance"; userId: string }
  | { type: "get_position"; userId: string }
  | { type: "get_orderbook"; symbol: string; levels?: number };

const log = createLogger("api-engine-client");

let input: StreamProducer | null = null;
let query: StreamProducer | null = null;

interface Waiter {
  resolve: (evt: EngineOutputEvent | null) => void;
  timer: ReturnType<typeof setTimeout>;
  match: Set<EngineOutputEventType>;
}
const commandWaiters = new Map<string, Waiter>();
const queryWaiters = new Map<string, { resolve: (v: unknown) => void; timer: ReturnType<typeof setTimeout> }>();

export async function initEngineClient(): Promise<void> {
  const writer = await createRedis(config.redisUrl, "api-input");
  const outSub = await createRedis(config.redisUrl, "api-output-sub");
  const qWriter = await createRedis(config.redisUrl, "api-query");
  const qSub = await createRedis(config.redisUrl, "api-query-sub");

  input = new StreamProducer(writer, STREAMS.input);
  query = new StreamProducer(qWriter, STREAMS.query);

  void tailOutput(outSub);
  void tailQueryReplies(qSub);
  log.info("engine client ready");
}

async function tailOutput(client: Redis): Promise<void> {
  let lastId = "$";
  for (;;) {
    const res = await client.xRead({ key: STREAMS.output, id: lastId }, { COUNT: 100, BLOCK: 5000 });
    if (!res) continue;
    const stream = Array.isArray(res) ? res[0] : undefined;
    for (const m of stream?.messages ?? []) {
      lastId = m.id;
      let evt: EngineOutputEvent;
      try {
        evt = decodeOutputEvent(m.message);
      } catch {
        continue;
      }
      const corr = evt.correlationId;
      if (!corr) continue;
      const waiter = commandWaiters.get(corr);
      if (waiter && waiter.match.has(evt.eventType)) {
        clearTimeout(waiter.timer);
        commandWaiters.delete(corr);
        waiter.resolve(evt);
      }
    }
  }
}

async function tailQueryReplies(client: Redis): Promise<void> {
  let lastId = "$";
  for (;;) {
    const res = await client.xRead({ key: STREAMS.queryReply, id: lastId }, { COUNT: 100, BLOCK: 5000 });
    if (!res) continue;
    const stream = Array.isArray(res) ? res[0] : undefined;
    for (const m of stream?.messages ?? []) {
      lastId = m.id;
      const parsed = engineQueryReplySchema.safeParse(JSON.parse(m.message.data ?? "{}"));
      if (!parsed.success) continue;
      const waiter = queryWaiters.get(parsed.data.correlationId);
      if (waiter) {
        clearTimeout(waiter.timer);
        queryWaiters.delete(parsed.data.correlationId);
        waiter.resolve(parsed.data.ok ? parsed.data.data : null);
      }
    }
  }
}

export interface CommandInput {
  eventType: EngineInputEvent["eventType"];
  payload: unknown;
  commandId?: string;
}

function buildEvent(cmd: CommandInput, correlationId: string): EngineInputEvent {
  const event = {
    eventId: newEventId(),
    eventType: cmd.eventType,
    ts: Date.now(),
    source: "api",
    schemaVersion: SCHEMA_VERSION,
    correlationId,
    commandId: cmd.commandId,
    payload: cmd.payload,
  };
  return engineInputEventSchema.parse(event);
}

/** Durably enqueue a command without waiting for the engine's result. */
export async function fireCommand(cmd: CommandInput): Promise<void> {
  if (!input) throw new Error("engine client not initialised");
  await input.add(encodeEvent(buildEvent(cmd, newEventId("corr"))));
}

/**
 * Durably enqueue a command and wait (bounded) for one of `resolveOn` output
 * events correlated to it. Resolves to `null` on timeout — the command stays
 * queued and will still be processed, so callers should return 202, not 5xx.
 */
export async function submitCommand(
  cmd: CommandInput,
  resolveOn: EngineOutputEventType[],
  timeoutMs = config.api.engineReplyTimeoutMs,
): Promise<EngineOutputEvent | null> {
  if (!input) throw new Error("engine client not initialised");
  const correlationId = newEventId("corr");
  const event = buildEvent(cmd, correlationId);

  return new Promise<EngineOutputEvent | null>((resolve) => {
    const timer = setTimeout(() => {
      commandWaiters.delete(correlationId);
      resolve(null);
    }, timeoutMs);
    commandWaiters.set(correlationId, { resolve, timer, match: new Set(resolveOn) });

    input!.add(encodeEvent(event)).catch((err) => {
      clearTimeout(timer);
      commandWaiters.delete(correlationId);
      log.error("failed to enqueue command", { err: String(err) });
      resolve(null);
    });
  });
}

export async function engineQuery<T = unknown>(
  q: QueryInput,
  timeoutMs = 3000,
): Promise<T | null> {
  if (!query) throw new Error("engine client not initialised");
  const correlationId = newEventId("q");
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => {
      queryWaiters.delete(correlationId);
      resolve(null);
    }, timeoutMs);
    queryWaiters.set(correlationId, { resolve: (v) => resolve(v as T), timer });
    query!
      .add({ data: JSON.stringify({ ...q, correlationId }), correlationId })
      .catch(() => {
        clearTimeout(timer);
        queryWaiters.delete(correlationId);
        resolve(null);
      });
  });
}
