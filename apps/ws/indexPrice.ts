import { WebSocket } from "ws";
import type { MessageEvent } from "ws";

interface MarkPriceStream {
  e: string; // event type: "markPriceUpdate"
  E: number; // event time
  s: string; // symbol
  p: string; // mark price
  i: string; // index price
  r: string; // funding rate
  T: number; // next funding time
}

let indexPrice: number | null = null;
let lastUpdate = 0;

function connect(): void {
  const ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@markPrice@1s");

  ws.on("message", (data: WebSocket.RawData) => {
    try {
      const parsed: MarkPriceStream = JSON.parse(data.toString());
      indexPrice = parseFloat(parsed.i);
      lastUpdate = Date.now();
    } catch (err) {
      console.error("parse error", err);
    }
  });

  ws.on("close", () => {
    console.warn("WS closed, reconnecting in 1s");
    setTimeout(connect, 1000);
  });

  ws.on("error", (err) => {
    console.error("WS error", err);
    ws.close();
  });
}

export { indexPrice, lastUpdate };
connect();
