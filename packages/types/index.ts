type eventType =
  | "add_balance"
  | "create_market"
  | "delete_order"
  | "user_balance"
  | "create_order"
  | "create_user";

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
  side: "BUY" | "SELL";
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
  side: "BUY" | "SELL";
  ordertype: "Market" | "LIMIT";
  margin: number;
  lavarage: number;
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

type payload = {
  type: eventType;
  data: eventData;
  loopBackId: string;
};

export type { payload };

// 1. Define your core data payloads as a single lookup map
// interface PayloadMap {
//   add_balance: { userId: string; balance: string };
//   create_market: { slug: string; imageUrl: string };
//   delete_order: { userId: string; orderId: string };
//   user_balance: { userId: string; balance: string };
//   create_order: {userId: string; marketId: string; quantity: string; price: string; side: string; ordertype: string; };
//   create_user: {username: string; usd_Balance: number; lockedBalance: number; userid: string;};

// 2. Use a generic mapped type to auto-generate the union
// export type payload = {
//   [K in keyof PayloadMap]: {
//     type: K;
//     data: PayloadMap[K];
//     loopbackid: string;
//   };
// }[keyof PayloadMap];
