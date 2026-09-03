import { z } from "zod";

export const SCHEMA_VERSION = 1;

/**
 * Every event flowing through a redis stream is wrapped in this envelope.
 *
 * - `eventId`   unique id, assigned by the PRODUCER (api / observer / engine).
 *               Never generated inside the engine's pure `reduce` so that
 *               replay is deterministic.
 * - `commandId` idempotency key for client-issued commands. The engine records
 *               applied commandIds and treats a repeat as a no-op re-emit.
 * - `ts`        producer wall-clock (epoch ms). Domain logic must only use
 *               timestamps carried in the payload, never `Date.now()`.
 */
export const envelopeBase = z.object({
  eventId: z.string().min(1),
  ts: z.number().int().nonnegative(),
  source: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  correlationId: z.string().min(1).optional(),
  causationId: z.string().min(1).optional(),
  commandId: z.string().min(1).optional(),
});

export type EnvelopeMeta = z.infer<typeof envelopeBase>;

export function withEnvelope<T extends string, P extends z.ZodTypeAny>(
  eventType: T,
  payload: P,
) {
  return envelopeBase.extend({
    eventType: z.literal(eventType),
    payload,
  });
}

let counter = 0;
/** Monotonic, collision-resistant id for producers. */
export function newEventId(prefix = "evt"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
