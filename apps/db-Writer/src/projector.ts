import prisma from "@repo/db";
import type { EngineOutputEvent } from "@repo/events";
import { createLogger } from "@repo/logger";

const log = createLogger("db-poller-projector");
const CONSUMER = "db-poller";

const r = Math.round;

/**
 * Apply one engine output event to the durable projection, idempotently.
 *
 * The ProcessedEvent insert and the projection write happen in one
 * transaction; a duplicate delivery hits the (consumer,eventId) primary key,
 * the transaction aborts, and we treat it as already-done.
 */
export async function project(evt: EngineOutputEvent, streamId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.processedEvent.create({ data: { consumer: CONSUMER, eventId: evt.eventId } });
      await applyEvent(tx, evt);
      await tx.consumerCheckpoint.upsert({
        where: { consumer: CONSUMER },
        create: { consumer: CONSUMER, lastEventId: streamId },
        update: { lastEventId: streamId },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint") && err.message.includes("processed_events")) {
      log.debug("duplicate event ignored", { eventId: evt.eventId });
      return;
    }
    throw err;
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function walletId(tx: Tx, userId: string): Promise<string | null> {
  const w = await tx.wallet.findUnique({ where: { userId }, select: { id: true } });
  return w?.id ?? null;
}

async function applyEvent(tx: Tx, evt: EngineOutputEvent): Promise<void> {
  switch (evt.eventType) {
    case "order.accepted": {
      const p = evt.payload;
      const statusMap = {
        OPEN: "OPEN",
        PARTIAL: "PARTIALLYFILLED",
        FILLED: "FILLED",
        CANCELLED: "CANCELLED",
        REJECTED: "REJECTED",
      } as const;
      await tx.order.update({
        where: { id: p.orderId },
        data: {
          status: statusMap[p.status],
          filledQuantity: r(p.filledQuantity),
          avgFillPrice: r(p.avgFillPrice),
        },
      }).catch(() => {});
      return;
    }
    case "order.rejected":
      await tx.order.update({ where: { id: evt.payload.orderId }, data: { status: "REJECTED" } }).catch(() => {});
      return;
    case "order.cancelled":
      await tx.order.update({ where: { id: evt.payload.orderId }, data: { status: "CANCELLED" } }).catch(() => {});
      return;

    case "trade.executed": {
      const p = evt.payload;
      const [makerWallet, takerWallet] = await Promise.all([
        walletId(tx, p.makerUserId),
        walletId(tx, p.takerUserId),
      ]);
      if (!makerWallet || !takerWallet) {
        log.warn("trade for unknown wallet, skipping fill row", { tradeId: p.tradeId });
        return;
      }
      await tx.fills.upsert({
        where: { tradeId: p.tradeId },
        create: {
          tradeId: p.tradeId,
          makerId: makerWallet,
          takerId: takerWallet,
          makerOrderId: p.makerOrderId,
          takerOrderId: p.takerOrderId,
          quantity: r(p.quantity),
          price: r(p.price),
        },
        update: {},
      });
      return;
    }

    case "position.updated": {
      const p = evt.payload;
      const wId = await walletId(tx, p.userId);
      if (!wId) return;
      await tx.position.upsert({
        where: { userId: p.userId },
        create: {
          userId: p.userId,
          size: r(p.size),
          entryPrice: r(p.entryPrice),
          margin: r(p.margin),
          leverage: r(p.leverage),
          liquidationPrice: r(p.liqPrice),
          realizedPnl: r(p.realizedPnl),
          unrealizedPnl: r(p.unrealizedPnl),
          markPrice: r(p.markPrice),
        },
        update: {
          size: r(p.size),
          entryPrice: r(p.entryPrice),
          margin: r(p.margin),
          leverage: r(p.leverage),
          liquidationPrice: r(p.liqPrice),
          realizedPnl: r(p.realizedPnl),
          unrealizedPnl: r(p.unrealizedPnl),
          markPrice: r(p.markPrice),
        },
      });
      return;
    }

    case "balance.updated": {
      const p = evt.payload;
      await tx.wallet.update({
        where: { userId: p.userId },
        data: { balance: r(p.total), freeBalance: r(p.free), lockedBalance: r(p.locked) },
      }).catch(() => {});
      return;
    }

    case "position.liquidated":
    case "orderbook.delta":
    case "orderbook.snapshot":
    case "command.rejected":
      return;
  }
}
