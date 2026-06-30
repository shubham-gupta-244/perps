import  prisma  from "@repo/db";
import type { Request, Response } from "express";

export const userFillsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = req.user?.userId;
  const userFills = await prisma.fills.findMany({
    where: { makerId: userId, takerId: userId },
  });
  if (!userFills) {
    res.status(404);
    throw new Error("invalid userId or zeroFills on this userId");
  }
  res.status(200).json({
    userFills,
  });
};
