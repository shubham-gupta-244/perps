import prisma from "@repo/db";
import type { Request, Response } from "express";
import z from "zod";
import { ValidationError } from "../Error/validationError";
import { fireCommand } from "../engine/client";

const onrampSchema = z.object({
  amount: z.number().positive(),
});

export const onrampController = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId as string;
  const body = onrampSchema.safeParse(req.body);
  if (!body.success) {
    throw new ValidationError([{ path: "amount", message: "amount must be a positive number" }]);
  }
  const { amount } = body.data;

  const updatedWallet = await prisma.wallet.update({
    where: { userId },
    data: { balance: { increment: amount }, freeBalance: { increment: amount } },
  });

  await fireCommand({
    eventType: "balance.deposited",
    commandId: crypto.randomUUID(),
    payload: { userId, amount },
  });

  res.status(200).json({ message: "balance updated", wallet: updatedWallet });
};
