import prisma from "@repo/db";
import type { Request, Response } from "express";
import z from "zod";
import { ValidationError } from "../Error/validationError";

const onrampSchema = z.object({
  amount: z.number(),
});

export const onrampController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.userId;
  const requirebody = onrampSchema.safeParse(req.body);
  if (!requirebody.success) {
    throw new ValidationError([{ path: "amount", message: "" }]);
  }
  const amount = req.body.amount;
  const updateBalance = await prisma.wallet.update({
    where: { userId: userId },
    data: { balance: amount },
  });
  return;
};
