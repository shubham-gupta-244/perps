import type { Request, Response } from "express";
import { sendToStream } from "../utils/sendToEngine";
import { createLoopBackId } from "../utils/loopbackId";
import { getIndexPrice } from "../utils/priceClient";

export const getPrice = async (req: Request, res: Response): Promise<void> => {
  const price = await getIndexPrice();
  res.status(200).json({ price });
};

export const getOrderBook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const response = await sendToStream({
    type: "get_orderbook",
    data: { levels: 20 },
    loopBackId: createLoopBackId(6),
  });
  if (!response) {
    res.status(504).json({
      message: "did not receive a response from the matching engine in time",
    });
    return;
  }
  res.status(200).json(response.data);
};
