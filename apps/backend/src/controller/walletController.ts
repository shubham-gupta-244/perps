import type { Request, Response } from "express";
import { sendToStream } from "../utils/sendToEngine";
import { createLoopBackId } from "../utils/loopbackId";

export const getBalance = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId as string;
  const response = await sendToStream({
    type: "user_balance",
    data: { userId, balance: 0 },
    loopBackId: createLoopBackId(6),
  });
  if (!response) {
    res.status(504).json({
      message: "did not receive a response from the matching engine in time",
    });
    return;
  }
  if (!response.success) {
    res.status(404).json({ message: response.message ?? "user not found" });
    return;
  }
  res.status(200).json(response.data);
};

export const getPosition = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId as string;
  const response = await sendToStream({
    type: "get_position",
    data: { userId },
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
