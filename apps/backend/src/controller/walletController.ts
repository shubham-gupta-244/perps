import type { Request, Response } from "express";
import { engineQuery } from "../engine/client";
import { GatewayTimeoutError } from "../Error/apiError";

export const getBalance = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId as string;
  const data = await engineQuery<{ total: number; free: number; locked: number }>({
    type: "get_balance",
    userId,
  });
  if (!data) throw new GatewayTimeoutError("engine did not respond in time");
  res.status(200).json({ userId, ...data });
};

export const getPosition = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId as string;
  const data = await engineQuery({ type: "get_position", userId });
  res.status(200).json(data ?? null);
};
