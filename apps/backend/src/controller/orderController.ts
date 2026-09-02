import { z } from "zod";
import type { Request, Response } from "express";
import prisma from "@repo/db";
import { sendToStream } from "../utils/sendToEngine";
import { createLoopBackId } from "../utils/loopbackId";

const orderparser = z.object({
  quantity: z.number().positive(),
  price: z.number().positive(),
  ordertype: z.enum(["LIMIT", "MARKET"]),
  side: z.enum(["Bid", "Ask"]),
  leverage: z.number().positive(),
  margin: z.number().positive(),
  liquidationPrice: z.number(),
});

export const OrderController = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId as string;
  const validbody = orderparser.safeParse(req.body);
  if (!validbody.success) {
    res.status(400).json({ message: "invalid form of body", issues: validbody.error.issues });
    return;
  }
  const { quantity, price, ordertype, side, leverage, margin, liquidationPrice } =
    validbody.data;

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    res.status(404).json({ message: "wallet not found for this user" });
    return;
  }

  const order = await prisma.order.create({
    data: {
      walletId: wallet.id,
      orderType: ordertype === "LIMIT" ? "LIMIT" : "MARKET",
      side: side === "Bid" ? "BID" : "ASK",
      quantity,
      price,
      leverage,
      liquidationPrice,
      lockedBalance: margin,
      status: "OPEN",
    },
  });

  const loopBackId = createLoopBackId(6);
  const response = await sendToStream({
    type: "create_order",
    data: {
      userId,
      orderId: order.id,
      limitPrice: price,
      ordertype,
      quantity,
      side,
      margin,
      leverage,
      liquidationPrice,
    },
    loopBackId,
  });
  if (!response) {
    res.status(504).json({
      message: "did not receive a response from the matching engine in time",
      orderId: order.id,
    });
    return;
  }

  if (!response.success) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CLOSE" },
    });
    res.status(400).json({
      message: response.message ?? "order was rejected by the matching engine",
      orderId: order.id,
    });
    return;
  }

  const orderResult = response.data as
    | {
        status: string;
        fills?: {
          makerId: string;
          takerId: string;
          makerOrderId: string;
          takerOrderId: string;
          price: number;
          qunatity: number;
        }[];
      }
    | undefined;
  const statusMap: Record<string, "OPEN" | "PARTIALLYFILLED" | "CLOSE"> = {
    OPEN: "OPEN",
    PARTIAL: "PARTIALLYFILLED",
    FILLED: "CLOSE",
    CANCELLED: "CLOSE",
  };
  if (orderResult && statusMap[orderResult.status]) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: statusMap[orderResult.status] },
    });
  }

  if (orderResult?.fills && orderResult.fills.length > 0) {
    const userIds = Array.from(
      new Set(orderResult.fills.flatMap((f) => [f.makerId, f.takerId])),
    );
    const wallets = await prisma.wallet.findMany({
      where: { userId: { in: userIds } },
    });
    const walletByUserId = new Map(wallets.map((w) => [w.userId, w.id]));

    await prisma.fills.createMany({
      data: orderResult.fills
        .filter(
          (f) => walletByUserId.has(f.makerId) && walletByUserId.has(f.takerId),
        )
        .map((f) => ({
          makerId: walletByUserId.get(f.makerId)!,
          takerId: walletByUserId.get(f.takerId)!,
          makerOrderId: f.makerOrderId,
          takerOrderId: f.takerOrderId,
          price: f.price,
          quantity: f.qunatity,
        })),
    });
  }

  res.status(200).json({
    message: "order has been placed",
    orderId: order.id,
    response,
  });
};

export const orderHistory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: req.user?.userId },
  });
  if (!wallet) {
    res.status(404).json({ message: "wallet not found for this user" });
    return;
  }
  const orderHistory = await prisma.order.findMany({
    where: { walletId: wallet.id },
    include: {
      makerFills: {
        select: { quantity: true, price: true, createdAt: true },
      },
      takerFills: {
        select: { price: true, quantity: true, createdAt: true },
      },
    },
  });
  res.status(200).json({
    orderHistory,
  });
};

const cancelOrderParser = z.object({
  orderId: z.string(),
  price: z.number(),
  side: z.enum(["Bid", "Ask"]),
});

export const deleteOrder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.userId as string;
  const validbody = cancelOrderParser.safeParse(req.body);
  if (!validbody.success) {
    res.status(400).json({ message: "invalid form of body", issues: validbody.error.issues });
    return;
  }
  const { orderId, price, side } = validbody.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { wallet: { select: { userId: true } } },
  });
  if (!order || order.wallet.userId !== userId) {
    res.status(404).json({ message: "order not found" });
    return;
  }
  if (order.status === "CLOSE") {
    res.status(409).json({ message: "order is already closed" });
    return;
  }

  const loopBackId = createLoopBackId(6);
  const response = await sendToStream({
    type: "delete_order",
    data: { userId, orderId, price, side },
    loopBackId,
  });
  if (!response) {
    res.status(504).json({
      message: "did not receive a response from the matching engine in time",
    });
    return;
  }

  if (!response.success) {
    res.status(400).json({
      message: response.message ?? "order could not be cancelled",
    });
    return;
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "CLOSE" },
  });

  res.status(200).json({
    message: "order has been deleted",
    response,
  });
};
