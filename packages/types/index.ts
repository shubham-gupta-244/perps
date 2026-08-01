export type add_balance = {
  userId: string;
  balance: number;
};

export type create_market = {
  slug: string;
  imageUrl: string;
};

export type cancel_order = {
  userId: string;
  orderId: string;
  price: number;
  side: "Bid" | "Ask";
};

export type user_balance = {
  userId: string;
  balance: number;
};

export type create_order = {
  orderId: string;
  userId: string;
  marketId: string;
  quantity: number;
  limitPrice: number;
  side: "Bid" | "Ask";
  ordertype: "MARKET" | "LIMIT";
  margin: number;
  lavarage: number;
  // either take liquidation or margin as input
  liquidationPrice: number;
};

export type create_user = {
  username: string;
  usd_Balance: number;
  lockedBalance: number;
  userid: string;
};

export type eventData =
  | create_market
  | create_order
  | create_user
  | add_balance
  | user_balance
  | cancel_order;

interface PayloadMap {
  add_balance: add_balance;
  create_market: create_market;
  delete_order: cancel_order;
  user_balance: user_balance;
  create_order: create_order;
  create_user: create_user;
}

export type payload = {
  [K in keyof PayloadMap]: {
    type: K;
    data: PayloadMap[K];
    loopBackId: string;
  };
}[keyof PayloadMap];
