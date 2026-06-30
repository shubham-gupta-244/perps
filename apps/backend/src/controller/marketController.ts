import  prisma  from "@repo/db";
import type { Request, Response } from "express";

export const getMarkets = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const allMarkets = await prisma.market.findMany();
  if (!allMarkets) {
    res.status(404).json({
      message: "currently exchange does not support any market ",
    });
    throw new Error("error while fetching market");
  }
  res.status(200).json({
    allMarkets,
  });
};
