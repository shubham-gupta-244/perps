import { z } from "zod";
import { withEnvelope } from "./envelope";

export const sideSchema = z.enum(["Bid", "Ask"]);
export type Side = z.infer<typeof sideSchema>;

export const orderTypeSchema = z.enum(["LIMIT", "MARKET"]);
export type OrderType = z.infer<typeof orderTypeSchema>;

/* ------------------------------- input events ----------------------------- */

export const userCreated = withEnvelope(
  "user.created",
  z.object({
    userId: z.string().min(1),
    openingBalance: z.number().nonnegative(),
  }),
);

export const balanceDeposited = withEnvelope(
  "balance.deposited",
  z.object({
    userId: z.string().min(1),
    amount: z.number().positive(),
  }),
);

export const placeOrderCommand = withEnvelope(
  "order.place",
  z.object({
    userId: z.string().min(1),
    orderId: z.string().min(1),
    side: sideSchema,
    orderType: orderTypeSchema,
    quantity: z.number().positive(),
    /** Limit price. Ignored for MARKET orders. */
    price: z.number().nonnegative(),
    leverage: z.number().positive(),
    margin: z.number().positive(),
  }),
);

export const cancelOrderCommand = withEnvelope(
  "order.cancel",
  z.object({
    userId: z.string().min(1),
    orderId: z.string().min(1),
    side: sideSchema,
    price: z.number().nonnegative(),
  }),
);

export const indexPriceUpdated = withEnvelope(
  "index_price.updated",
  z.object({
    symbol: z.string().min(1),
    price: z.number().positive(),
    /** Monotonic sequence from the observer; engine drops stale/duplicate. */
    observerSeq: z.number().int().nonnegative(),
    sourceTs: z.number().int().nonnegative(),
  }),
);

export const engineInputEventSchema = z.discriminatedUnion("eventType", [
  userCreated,
  balanceDeposited,
  placeOrderCommand,
  cancelOrderCommand,
  indexPriceUpdated,
]);

export type EngineInputEvent = z.infer<typeof engineInputEventSchema>;
export type UserCreatedEvent = z.infer<typeof userCreated>;
export type BalanceDepositedEvent = z.infer<typeof balanceDeposited>;
export type PlaceOrderCommandEvent = z.infer<typeof placeOrderCommand>;
export type CancelOrderCommandEvent = z.infer<typeof cancelOrderCommand>;
export type IndexPriceUpdatedEvent = z.infer<typeof indexPriceUpdated>;

export type EngineInputEventType = EngineInputEvent["eventType"];
