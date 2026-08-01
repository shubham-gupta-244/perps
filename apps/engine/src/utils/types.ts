export type BidAsk = {
  id: string;
  userId: string;
  orderId: string;
  price: number;
  quantity: number;
  remainingQuantity: number;
  timeStamp: number;
  side: "Bid" | "Ask";
  type: "Limit" | "Market";
  lockedCollateral: number;
  lavarage: number;
};

export type Fills = {
  makerId: string;
  takerId: string;
  makerOrderId: string;
  takerOrderId: String;
  marketId: string;
  price: number;
  qunatity: number;
  createdAt: Date;
};

export type User = {
  userId: string;
  balance: number;
  lockedBalance: number;
  freeBalance: number;
};
