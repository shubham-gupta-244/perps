export type add_balance = {
  userId: string;
  balance: number;
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
  quantity: number;
  limitPrice: number;
  side: "Bid" | "Ask";
  ordertype: "MARKET" | "LIMIT";
  margin: number;
  leverage: number;
  // either take liquidation or margin as input
  liquidationPrice: number;
};

export type create_user = {
  username: string;
  usd_Balance: number;
  lockedBalance: number;
  userid: string;
};

export type get_position = {
  userId: string;
};

export type get_orderbook = {
  levels?: number;
};

export type eventData =
  | create_order
  | create_user
  | add_balance
  | user_balance
  | cancel_order
  | get_position
  | get_orderbook;

interface PayloadMap {
  add_balance: add_balance;
  delete_order: cancel_order;
  user_balance: user_balance;
  create_order: create_order;
  create_user: create_user;
  get_position: get_position;
  get_orderbook: get_orderbook;
}

export type payload = {
  [K in keyof PayloadMap]: {
    type: K;
    data: PayloadMap[K];
    loopBackId: string;
  };
}[keyof PayloadMap];

export type EngineResponse<T = unknown> = {
  loopBackId: string;
  success: boolean;
  message?: string;
  data?: T;
};

export type PositionSnapshot = {
  userId: string;
  size: number;
  entryPrice: number;
  margin: number;
  leverage: number;
  liqPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  lastMarkPrice: number;
};

export type OrderBookLevel = {
  price: number;
  quantity: number;
};

export type OrderBookSnapshot = {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastTradePrice: number;
};

export type BalanceSnapshot = {
  userId: string;
  balance: number;
  freeBalance: number;
  lockedBalance: number;
};
