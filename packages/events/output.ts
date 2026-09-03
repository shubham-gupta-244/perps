import { z } from "zod";
import { withEnvelope } from "./envelope";
import { sideSchema } from "./input";

export const orderStatusSchema = z.enum([
  "OPEN",
  "PARTIAL",
  "FILLED",
  "CANCELLED",
  "REJECTED",
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderAccepted = withEnvelope(
  "order.accepted",
  z.object({
    orderId: z.string(),
    userId: z.string(),
    status: orderStatusSchema,
    filledQuantity: z.number(),
    remainingQuantity: z.number(),
    avgFillPrice: z.number(),
  }),
);

export const orderRejected = withEnvelope(
  "order.rejected",
  z.object({
    orderId: z.string(),
    userId: z.string(),
    reason: z.string(),
  }),
);

export const orderCancelled = withEnvelope(
  "order.cancelled",
  z.object({
    orderId: z.string(),
    userId: z.string(),
    releasedMargin: z.number(),
  }),
);

export const tradeExecuted = withEnvelope(
  "trade.executed",
  z.object({
    tradeId: z.string(),
    symbol: z.string(),
    makerOrderId: z.string(),
    takerOrderId: z.string(),
    makerUserId: z.string(),
    takerUserId: z.string(),
    price: z.number(),
    quantity: z.number(),
    takerSide: sideSchema,
    ts: z.number().int(),
  }),
);

export const orderBookDelta = withEnvelope(
  "orderbook.delta",
  z.object({
    symbol: z.string(),
    side: sideSchema,
    price: z.number(),
    newQuantity: z.number(),
  }),
);

export const orderBookSnapshot = withEnvelope(
  "orderbook.snapshot",
  z.object({
    symbol: z.string(),
    bids: z.array(z.tuple([z.number(), z.number()])),
    asks: z.array(z.tuple([z.number(), z.number()])),
    lastTradePrice: z.number(),
  }),
);

export const positionUpdated = withEnvelope(
  "position.updated",
  z.object({
    userId: z.string(),
    size: z.number(),
    entryPrice: z.number(),
    margin: z.number(),
    leverage: z.number(),
    liqPrice: z.number(),
    realizedPnl: z.number(),
    unrealizedPnl: z.number(),
    markPrice: z.number(),
  }),
);

export const balanceUpdated = withEnvelope(
  "balance.updated",
  z.object({
    userId: z.string(),
    total: z.number(),
    free: z.number(),
    locked: z.number(),
  }),
);

export const positionLiquidated = withEnvelope(
  "position.liquidated",
  z.object({
    userId: z.string(),
    markPrice: z.number(),
    realizedPnl: z.number(),
  }),
);

export const commandRejected = withEnvelope(
  "command.rejected",
  z.object({
    commandId: z.string(),
    reason: z.string(),
  }),
);

export const engineOutputEventSchema = z.discriminatedUnion("eventType", [
  orderAccepted,
  orderRejected,
  orderCancelled,
  tradeExecuted,
  orderBookDelta,
  orderBookSnapshot,
  positionUpdated,
  balanceUpdated,
  positionLiquidated,
  commandRejected,
]);

export type EngineOutputEvent = z.infer<typeof engineOutputEventSchema>;
export type OrderAcceptedEvent = z.infer<typeof orderAccepted>;
export type OrderRejectedEvent = z.infer<typeof orderRejected>;
export type OrderCancelledEvent = z.infer<typeof orderCancelled>;
export type TradeExecutedEvent = z.infer<typeof tradeExecuted>;
export type OrderBookDeltaEvent = z.infer<typeof orderBookDelta>;
export type OrderBookSnapshotEvent = z.infer<typeof orderBookSnapshot>;
export type PositionUpdatedEvent = z.infer<typeof positionUpdated>;
export type BalanceUpdatedEvent = z.infer<typeof balanceUpdated>;
export type PositionLiquidatedEvent = z.infer<typeof positionLiquidated>;
export type CommandRejectedEvent = z.infer<typeof commandRejected>;

export type EngineOutputEventType = EngineOutputEvent["eventType"];
