import type { Request, Response } from "express";
import { z } from "zod";
import { engineQuery } from "../engine/client";
import { getIndexPrice } from "../utils/priceClient";
import { config } from "@repo/config";
import { GatewayTimeoutError } from "../Error/apiError";

export const getPrice = async (_req: Request, res: Response): Promise<void> => {
  const price = await getIndexPrice();
  res.status(200).json({ price });
};

const orderBookQuery = z.object({
  levels: z.coerce.number().int().positive().max(500).default(20),
});

export const getOrderBook = async (req: Request, res: Response): Promise<void> => {
  const { levels } = orderBookQuery.parse(req.query);
  const data = await engineQuery({ type: "get_orderbook", symbol: config.symbol, levels });
  if (!data) throw new GatewayTimeoutError("engine did not respond in time");
  res.status(200).json(data);
};
