import { createLogger } from "@repo/logger";

const log = createLogger("observer-binance");

export interface MarkPriceTick {
  /** Binance event time (ms) — monotonic non-decreasing, used as observerSeq. */
  eventTime: number;
  symbol: string;
  indexPrice: number;
}

interface MarkPriceStream {
  e: string;
  E: number;
  s: string;
  p: string;
  i: string;
}

/**
 * Maintains a Binance mark-price websocket with automatic reconnect and
 * hands each tick to `onTick`. This is the ONLY component that talks to
 * Binance; the engine never does.
 */
export function connectBinance(url: string, onTick: (tick: MarkPriceTick) => void): void {
  let backoff = 500;

  const connect = () => {
    const ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      backoff = 500;
      log.info("binance ws open", { url });
    });

    ws.addEventListener("message", (ev) => {
      try {
        const parsed: MarkPriceStream = JSON.parse(String(ev.data));
        const price = Number.parseFloat(parsed.i);
        if (!Number.isFinite(price) || price <= 0) return;
        onTick({ eventTime: parsed.E, symbol: parsed.s, indexPrice: price });
      } catch (err) {
        log.warn("binance parse error", { err: String(err) });
      }
    });

    ws.addEventListener("close", () => {
      log.warn("binance ws closed; reconnecting", { backoff });
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 15_000);
    });

    ws.addEventListener("error", () => ws.close());
  };

  connect();
}
