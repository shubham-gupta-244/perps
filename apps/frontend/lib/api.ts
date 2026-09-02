const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("token");
}

export function setToken(token: string) {
  window.localStorage.setItem("token", token);
}

export function clearToken() {
  window.localStorage.removeItem("token");
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.message ?? `request failed (${res.status})`);
  }
  return body as T;
}

export type Wallet = {
  id: string;
  userId: string;
  balance: number;
  freeBalance: number;
  lockedBalance: number;
};

export type Balance = {
  userId: string;
  balance: number;
  freeBalance: number;
  lockedBalance: number;
};

export type Position = {
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

export type OrderBookLevel = { price: number; quantity: number };
export type OrderBook = {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastTradePrice: number;
};

export type OrderHistoryEntry = {
  id: string;
  orderType: "LIMIT" | "MARKET";
  side: "BID" | "ASK";
  quantity: number;
  price: number;
  leverage: number;
  status: "OPEN" | "PARTIALLYFILLED" | "CLOSE";
  createdAt: string;
};

export type FillEntry = {
  id: string;
  makerId: string;
  takerId: string;
  price: number;
  quantity: number;
  createdAt: string;
};

export const api = {
  signup: (username: string, password: string) =>
    request<{ message: string }>("/api/v1/signup", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<{ message: string; token: string }>("/api/v1/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  onramp: (amount: number) =>
    request<{ message: string; wallet: Wallet }>("/api/v1/onramp", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),

  getBalance: () => request<Balance>("/wallet/balance"),

  getPosition: () => request<Position>("/position"),

  getOrderBook: () => request<OrderBook>("/market/orderbook"),

  getPrice: () => request<{ price: number | null }>("/market/price"),

  placeOrder: (order: {
    quantity: number;
    price: number;
    ordertype: "LIMIT" | "MARKET";
    side: "Bid" | "Ask";
    leverage: number;
    margin: number;
    liquidationPrice: number;
  }) =>
    request<{ message: string; orderId: string; response: unknown }>("/order", {
      method: "POST",
      body: JSON.stringify(order),
    }),

  cancelOrder: (orderId: string, price: number, side: "Bid" | "Ask") =>
    request<{ message: string }>("/order", {
      method: "DELETE",
      body: JSON.stringify({ orderId, price, side }),
    }),

  getOrderHistory: () =>
    request<{ orderHistory: OrderHistoryEntry[] }>("/order/history"),

  getFills: () => request<{ userFills: FillEntry[] }>("/user/fills"),
};

export { ApiError };
