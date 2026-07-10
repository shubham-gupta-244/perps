import { z } from "zod";
import type { Request, Response } from "express";
import prisma from "@repo/db";
import { sendToStream } from "../utils/sendToEngine";
import { TimeoutError } from "redis";
import { createLoopBackId } from "../utils/loopback";
const orderparser = z.object({
  qunatity: z.number(),
  marketId: z.string(),
  prize: z.string(),
  ordertype: z.string(),
  side: z.string(),
});
export const OrderController = async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const validbody = orderparser.safeParse(req.body);
  if (!validbody) {
    res.status(404).json({ message: "invalid form of body" });
    return;
  }
  const { quantity, marketId, price, ordertype, side } = req.body;
  const orderId = crypto.randomUUID();

  // const createOrder = await prisma.order.create({
  //   data:{quantity,marketId,price,orderType:ordertype,side,userId}
  //  })
  const loopBackId = createLoopBackId(6) as string;
  const response = await sendToStream({
    type: "create_order",
    data: { marketId, userId, orderId, price, ordertype, quantity, side },
    loopBackId,
  });
  if (!response) {
    res.status(404).json({
      message: "did not recieve the response after sending to engine",
    });
    throw new TimeoutError();
  }
  res.status(200).json({
    messgae: "order has been placed",
    response,
  });
  return;
};

export const orderHistory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user?.userId },
    });
    if (!wallet) {
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
    if (!orderHistory) {
      res.status(404).json({
        message: "Invalid orderId",
      });
      throw new Error("invalid orderId");
    }
    res.status(200).json({
      orderHistory,
    });
  } catch (e) {
    console.log("error while fetching orderHistory from db", e);
  }
};

export const deleteOrder = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { orderId, price, side } = req.body;
  const userId = req.user?.userId as string;

  const loopBackId = createLoopBackId(6) as string;
  const response = await sendToStream({
    type: "delete_order",
    data: { userId, orderId, price, side },
    loopBackId,
  });
  if (!response) {
    res.status(404).json({
      message: "request time out",
    });
    throw new TimeoutError();
  }
  res.status(200).json({
    message: `order has been deleted`,
    response,
  });
};
