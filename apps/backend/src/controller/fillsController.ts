import prisma from "@repo/db";
import type { Request, Response } from "express";
import { NotFoundError } from "../Error/apiError";

export const userFillsController = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new NotFoundError("wallet not found for this user");

  const userFills = await prisma.fills.findMany({
    where: { OR: [{ makerId: wallet.id }, { takerId: wallet.id }] },
  });
  res.status(200).json({ userFills });
};
