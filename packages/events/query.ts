import { z } from "zod";

/**
 * Live engine reads. These NEVER enter the durable input log (they are not
 * state transitions and would bloat replay). They travel on a separate,
 * effectively-ephemeral request/reply stream and are correlated by `correlationId`.
 */

export const engineQuerySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("get_balance"), correlationId: z.string(), userId: z.string() }),
  z.object({ type: z.literal("get_position"), correlationId: z.string(), userId: z.string() }),
  z.object({
    type: z.literal("get_orderbook"),
    correlationId: z.string(),
    symbol: z.string(),
    levels: z.number().int().positive().max(500).default(20),
  }),
]);

export type EngineQuery = z.infer<typeof engineQuerySchema>;

export const engineQueryReplySchema = z.object({
  correlationId: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});

export type EngineQueryReply = z.infer<typeof engineQueryReplySchema>;
