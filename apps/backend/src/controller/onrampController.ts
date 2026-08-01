import prisma from "@repo/db";
import type { Request, Response } from "express";
import z from "zod";
import { ValidationError } from "../Error/validationError";

const onrampSchema = z.object({
  amount: z.number().positive(),
});

export const onrampController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.userId;
  const requirebody = onrampSchema.safeParse(req.body);
  if (!requirebody.success) {
    throw new ValidationError([{ path: "amount", message: "amount must be a positive number" }]);
  }
  const { amount } = requirebody.data;
  const updatedWallet = await prisma.wallet.update({
    where: { userId: userId },
    data: {
      balance: { increment: amount },
      freeBalance: { increment: amount },
    },
  });
  res.status(200).json({ message: "balance updated", wallet: updatedWallet });
};
