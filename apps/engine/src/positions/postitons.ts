type Side = "LONG" | "SHORT";

export class Position {
  userId: string;
  market: string;

  size: number = 0; // +ve long, -ve short
  entryPrice: number = 0;
  margin: number = 0;

  unrealizedPnl: number = 0;
  lastMarkPrice: number = 0;

  liqPrice: number = 0;

  constructor(userId: string, market: string) {
    this.userId = userId;
    this.market = market;
  }
}
