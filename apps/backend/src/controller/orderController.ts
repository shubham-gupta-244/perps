import { z } from "zod";
import type { Request, Response } from "express";
import prisma from "@repo/db";
import { submitCommand } from "../engine/client";
import type { OrderAcceptedEvent, OrderRejectedEvent } from "@repo/events";
import { BadRequestError, ConflictError, NotFoundError } from "../Error/apiError";

const orderParser = z.object({
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  ordertype: z.enum(["LIMIT", "MARKET"]),
  side: z.enum(["Bid", "Ask"]),
  leverage: z.number().positive(),
  margin: z.number().positive(),
});

export const OrderController = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId as string;
  const { quantity, price, ordertype, side, leverage, margin } = orderParser.parse(req.body);

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new NotFoundError("wallet not found for this user");

  // DB-first: durable order record before the command is emitted.
  const order = await prisma.order.create({
    data: {
      walletId: wallet.id,
      commandId: crypto.randomUUID(),
      orderType: ordertype,
      side: side === "Bid" ? "BID" : "ASK",
      quantity,
      price,
      leverage,
      liquidationPrice: 0,
      lockedBalance: margin,
      status: "PENDING",
    },
  });

  const result = await submitCommand(
    {
      eventType: "order.place",
      commandId: order.commandId!,
      payload: { userId, orderId: order.id, side, orderType: ordertype, quantity, price, leverage, margin },
    },
    ["order.accepted", "order.rejected"],
  );

  if (!result) {
    // engine hasn't replied yet; command is durably queued and the db-poller
    // will reconcile the order status from the output stream.
    res.status(202).json({ message: "order accepted for processing", orderId: order.id });
    return;
  }

  if (result.eventType === "order.rejected") {
    throw new BadRequestError((result as OrderRejectedEvent).payload.reason, { orderId: order.id });
  }

  const acc = result as OrderAcceptedEvent;
  res.status(200).json({
    message: "order processed",
    orderId: order.id,
    status: acc.payload.status,
    filledQuantity: acc.payload.filledQuantity,
    remainingQuantity: acc.payload.remainingQuantity,
    avgFillPrice: acc.payload.avgFillPrice,
  });
};

export const orderHistory = async (req: Request, res: Response): Promise<void> => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user?.userId } });
  if (!wallet) throw new NotFoundError("wallet not found for this user");

  const orders = await prisma.order.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    include: {
      makerFills: { select: { quantity: true, price: true, createdAt: true } },
      takerFills: { select: { price: true, quantity: true, createdAt: true } },
    },
  });
  res.status(200).json({ orderHistory: orders });
};

const cancelParser = z.object({
  orderId: z.string(),
  price: z.number().nonnegative(),
  side: z.enum(["Bid", "Ask"]),
});

export const deleteOrder = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId as string;
  const { orderId, price, side } = cancelParser.parse(req.body);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { wallet: { select: { userId: true } } },
  });
  if (!order || order.wallet.userId !== userId) throw new NotFoundError("order not found");
  if (["FILLED", "CANCELLED", "REJECTED", "CLOSE"].includes(order.status)) {
    throw new ConflictError(`order is ${order.status}`);
  }

  const result = await submitCommand(
    {
      eventType: "order.cancel",
      commandId: crypto.randomUUID(),
      payload: { userId, orderId, side, price },
    },
    ["order.cancelled", "order.rejected"],
  );

  if (!result) {
    res.status(202).json({ message: "cancellation accepted for processing", orderId });
    return;
  }
  if (result.eventType === "order.rejected") {
    throw new BadRequestError((result as OrderRejectedEvent).payload.reason, { orderId });
  }
  res.status(200).json({ message: "order cancelled", orderId });
};
