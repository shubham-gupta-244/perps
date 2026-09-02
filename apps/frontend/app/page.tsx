"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  clearToken,
  getToken,
  type Balance,
  type Position,
  type OrderBook,
  type OrderHistoryEntry,
  type FillEntry,
} from "../lib/api";

const POLL_MS = 2000;

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function Dashboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const [balance, setBalance] = useState<Balance | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [orders, setOrders] = useState<OrderHistoryEntry[]>([]);
  const [fills, setFills] = useState<FillEntry[]>([]);

  const [depositAmount, setDepositAmount] = useState("1000");
  const [side, setSide] = useState<"Bid" | "Ask">("Bid");
  const [ordertype, setOrdertype] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [quantity, setQuantity] = useState("1");
  const [orderPrice, setOrderPrice] = useState("");
  const [leverage, setLeverage] = useState("5");
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    setReady(true);
  }, [router]);

  const refresh = useCallback(async () => {
    try {
      const [balanceRes, positionRes, bookRes, priceRes, ordersRes, fillsRes] =
        await Promise.all([
          api.getBalance(),
          api.getPosition(),
          api.getOrderBook(),
          api.getPrice(),
          api.getOrderHistory(),
          api.getFills(),
        ]);
      setBalance(balanceRes);
      setPosition(positionRes);
      setOrderBook(bookRes);
      setPrice(priceRes.price);
      setOrders(
        [...ordersRes.orderHistory].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
      setFills(
        [...fillsRes.userFills].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("token")) {
        clearToken();
        router.push("/login");
      }
    }
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [ready, refresh]);

  async function onDeposit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return;
    await api.onramp(amount);
    refresh();
  }

  async function onPlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormMessage(null);

    const qty = Number(quantity);
    const lev = Number(leverage);
    const refPrice =
      ordertype === "LIMIT" ? Number(orderPrice) : price ?? Number(orderPrice);

    if (!qty || qty <= 0) {
      setFormError("quantity must be positive");
      return;
    }
    if (!refPrice || refPrice <= 0) {
      setFormError(
        ordertype === "LIMIT"
          ? "limit price must be positive"
          : "no index price available yet to size a market order",
      );
      return;
    }
    if (!lev || lev <= 0) {
      setFormError("leverage must be positive");
      return;
    }

    const margin = Math.ceil((refPrice * qty) / lev);

    setPlacing(true);
    try {
      const res = await api.placeOrder({
        quantity: qty,
        price: refPrice,
        ordertype,
        side,
        leverage: lev,
        margin,
        liquidationPrice: 0,
      });
      setFormMessage(res.message);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "order failed");
    } finally {
      setPlacing(false);
    }
  }

  async function onCancel(order: OrderHistoryEntry) {
    try {
      await api.cancelOrder(
        order.id,
        order.price,
        order.side === "BID" ? "Bid" : "Ask",
      );
      refresh();
    } catch {
      // ignore, the order may have already filled
    }
  }

  function onLogout() {
    clearToken();
    router.push("/login");
  }

  if (!ready) return null;

  const pnlColor = (position?.unrealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div className="flex items-baseline gap-4">
          <h1 className="text-lg font-semibold">BTC-PERP</h1>
          <span className="text-2xl font-mono tabular-nums">
            {price ? `$${fmt(price)}` : "loading..."}
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span>
            Balance:{" "}
            <span className="font-mono">{fmt(balance?.balance ?? 0)}</span>
          </span>
          <span>
            Free: <span className="font-mono">{fmt(balance?.freeBalance ?? 0)}</span>
          </span>
          <span>
            Locked:{" "}
            <span className="font-mono">{fmt(balance?.lockedBalance ?? 0)}</span>
          </span>
          <button
            onClick={onLogout}
            className="rounded border border-zinc-700 px-3 py-1 hover:bg-zinc-800"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-4">
        {/* Order book */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">Order Book</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="mb-1 text-zinc-500">Bids</p>
              {orderBook?.bids.length ? (
                orderBook.bids.map((b) => (
                  <div key={b.price} className="flex justify-between font-mono text-emerald-400">
                    <span>{fmt(b.price, 1)}</span>
                    <span>{fmt(b.quantity, 3)}</span>
                  </div>
                ))
              ) : (
                <p className="text-zinc-600">empty</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-zinc-500">Asks</p>
              {orderBook?.asks.length ? (
                orderBook.asks.map((a) => (
                  <div key={a.price} className="flex justify-between font-mono text-red-400">
                    <span>{fmt(a.price, 1)}</span>
                    <span>{fmt(a.quantity, 3)}</span>
                  </div>
                ))
              ) : (
                <p className="text-zinc-600">empty</p>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Last trade: <span className="font-mono">{fmt(orderBook?.lastTradePrice ?? 0)}</span>
          </p>
        </section>

        {/* Order form */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">Place Order</h2>
          <form onSubmit={onPlaceOrder} className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSide("Bid")}
                className={`flex-1 rounded py-2 text-sm font-medium ${
                  side === "Bid" ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-300"
                }`}
              >
                Long
              </button>
              <button
                type="button"
                onClick={() => setSide("Ask")}
                className={`flex-1 rounded py-2 text-sm font-medium ${
                  side === "Ask" ? "bg-red-500 text-zinc-950" : "bg-zinc-800 text-zinc-300"
                }`}
              >
                Short
              </button>
            </div>

            <select
              value={ordertype}
              onChange={(e) => setOrdertype(e.target.value as "LIMIT" | "MARKET")}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="LIMIT">Limit</option>
              <option value="MARKET">Market</option>
            </select>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Quantity</label>
              <input
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                type="number"
                step="any"
                min="0"
              />
            </div>

            {ordertype === "LIMIT" && (
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Limit price</label>
                <input
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={orderPrice}
                  onChange={(e) => setOrderPrice(e.target.value)}
                  type="number"
                  step="any"
                  min="0"
                  placeholder={price ? String(price) : ""}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Leverage: {leverage}x</label>
              <input
                type="range"
                min="1"
                max="20"
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                className="w-full"
              />
            </div>

            {formError && <p className="text-xs text-red-400">{formError}</p>}
            {formMessage && <p className="text-xs text-emerald-400">{formMessage}</p>}

            <button
              type="submit"
              disabled={placing}
              className={`w-full rounded py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50 ${
                side === "Bid" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"
              }`}
            >
              {placing ? "Placing..." : side === "Bid" ? "Buy / Long" : "Sell / Short"}
            </button>
          </form>

          <div className="mt-4 border-t border-zinc-800 pt-4">
            <h3 className="mb-2 text-xs font-semibold text-zinc-500">Deposit</h3>
            <form onSubmit={onDeposit} className="flex gap-2">
              <input
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                type="number"
                min="0"
              />
              <button
                type="submit"
                className="rounded bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600"
              >
                Add
              </button>
            </form>
          </div>
        </section>

        {/* Position */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">Position</h2>
          {position && position.size !== 0 ? (
            <div className="space-y-1 text-sm">
              <p>
                Side:{" "}
                <span className={position.size > 0 ? "text-emerald-400" : "text-red-400"}>
                  {position.size > 0 ? "LONG" : "SHORT"}
                </span>
              </p>
              <p>Size: <span className="font-mono">{fmt(Math.abs(position.size), 4)}</span></p>
              <p>Entry: <span className="font-mono">{fmt(position.entryPrice)}</span></p>
              <p>Leverage: <span className="font-mono">{position.leverage}x</span></p>
              <p>Margin: <span className="font-mono">{fmt(position.margin)}</span></p>
              <p>Liq. price: <span className="font-mono text-amber-400">{fmt(position.liqPrice)}</span></p>
              <p>
                Unrealized PnL:{" "}
                <span className={`font-mono ${pnlColor}`}>{fmt(position.unrealizedPnl)}</span>
              </p>
              <p>Realized PnL: <span className="font-mono">{fmt(position.realizedPnl)}</span></p>
            </div>
          ) : (
            <p className="text-sm text-zinc-600">No open position</p>
          )}
        </section>

        {/* Orders + fills */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 lg:col-span-1 lg:row-span-1">
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">Open Orders</h2>
          <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {orders.filter((o) => o.status !== "CLOSE").length === 0 && (
              <p className="text-zinc-600">No open orders</p>
            )}
            {orders
              .filter((o) => o.status !== "CLOSE")
              .map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-2 rounded bg-zinc-950 px-2 py-1"
                >
                  <span className={o.side === "BID" ? "text-emerald-400" : "text-red-400"}>
                    {o.side} {fmt(o.quantity, 3)} @ {fmt(o.price, 1)}
                  </span>
                  <button
                    onClick={() => onCancel(o)}
                    className="rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              ))}
          </div>
        </section>
      </main>

      <section className="grid grid-cols-1 gap-4 p-4 pt-0 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">Order History</h2>
          <div className="max-h-56 overflow-y-auto text-xs">
            <table className="w-full text-left">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-1">Side</th>
                  <th className="pb-1">Type</th>
                  <th className="pb-1">Qty</th>
                  <th className="pb-1">Price</th>
                  <th className="pb-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-zinc-800">
                    <td className={o.side === "BID" ? "text-emerald-400" : "text-red-400"}>
                      {o.side}
                    </td>
                    <td>{o.orderType}</td>
                    <td className="font-mono">{fmt(o.quantity, 3)}</td>
                    <td className="font-mono">{fmt(o.price, 1)}</td>
                    <td>{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">Fills</h2>
          <div className="max-h-56 overflow-y-auto text-xs">
            <table className="w-full text-left">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-1">Qty</th>
                  <th className="pb-1">Price</th>
                  <th className="pb-1">Time</th>
                </tr>
              </thead>
              <tbody>
                {fills.map((f) => (
                  <tr key={f.id} className="border-t border-zinc-800">
                    <td className="font-mono">{fmt(f.quantity, 3)}</td>
                    <td className="font-mono">{fmt(f.price, 1)}</td>
                    <td>{new Date(f.createdAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
