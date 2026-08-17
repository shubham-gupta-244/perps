import type { BidAsk, Fills } from "../utils/types";

type Side = "LONG" | "SHORT";

export class Position {
  userId: string;

  size: number = 0; // +ve long, -ve short
  entryPrice: number = 0;
  margin: number = 0;

  unrealizedPnl: number = 0;
  realizedPnl: number = 0;
  lastMarkPrice: number = 0;

  liqPrice: number = 0;

  constructor(userId: string) {
    this.userId = userId;
  }
}
