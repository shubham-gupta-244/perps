import type { Request, Response } from "express";
import { engineQuery } from "../engine/client";

export const getBalance = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId as string;
  const data = await engineQuery<{ total: number; free: number; locked: number }>({
    type: "get_balance",
    userId,
  });
  if (!data) {
    res.status(504).json({ message: "engine did not respond in time" });
    return;
  }
  res.status(200).json({ userId, ...data });
};

export const getPosition = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId as string;
  const data = await engineQuery({ type: "get_position", userId });
  res.status(200).json(data ?? null);
};
