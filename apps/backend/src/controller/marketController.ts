import type { Request, Response } from "express";
import { engineQuery } from "../engine/client";
import { getIndexPrice } from "../utils/priceClient";
import { config } from "@repo/config";

export const getPrice = async (_req: Request, res: Response): Promise<void> => {
  const price = await getIndexPrice();
  res.status(200).json({ price });
};

export const getOrderBook = async (req: Request, res: Response): Promise<void> => {
  const levels = Number(req.query.levels ?? 20);
  const data = await engineQuery({
    type: "get_orderbook",
    symbol: config.symbol,
    levels: Number.isFinite(levels) ? levels : 20,
  });
  if (!data) {
    res.status(504).json({ message: "engine did not respond in time" });
    return;
  }
  res.status(200).json(data);
};
