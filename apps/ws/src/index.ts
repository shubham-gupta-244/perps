import jwt from "jsonwebtoken";
import { createRedis } from "@repo/redis-streams";
import { config, STREAMS } from "@repo/config";
import { createLogger, metrics } from "@repo/logger";
import { decodeOutputEvent, type EngineOutputEvent } from "@repo/events";

const log = createLogger("ws");

type Channel = "orderbook" | "trades" | "user";
const CHANNELS: Channel[] = ["orderbook", "trades", "user"];

interface SocketData {
  userId: string | null;
  channels: Set<Channel>;
}

/** Which pub/sub topics an output event should be delivered on. */
function topicsFor(evt: EngineOutputEvent): string[] {
  switch (evt.eventType) {
    case "orderbook.delta":
    case "orderbook.snapshot":
      return ["orderbook"];
    case "trade.executed":
      return ["trades"];
    case "order.accepted":
    case "order.rejected":
    case "order.cancelled":
    case "balance.updated":
    case "position.updated":
    case "position.liquidated": {
      const uid = (evt.payload as { userId?: string }).userId;
      return uid ? [`user:${uid}`] : [];
    }
    default:
      return [];
  }
}

const reader = await createRedis(config.redisUrl, "ws-output");

const server = Bun.serve<SocketData>({
  port: config.ws.port,
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname === "/metrics")
      return new Response(metrics.prometheus(), { headers: { "content-type": "text/plain" } });

    const token = url.searchParams.get("token");
    let userId: string | null = null;
    if (token) {
      try {
        const payload = jwt.verify(token, config.ws.jwtSecret) as { userId: string };
        userId = payload.userId;
      } catch {
        return new Response("invalid token", { status: 401 });
      }
    }
    if (srv.upgrade(req, { data: { userId, channels: new Set<Channel>() } })) return;
    return new Response("expected websocket", { status: 426 });
  },
  websocket: {
    open(ws) {
      metrics.inc("ws_connections_total");
      ws.send(JSON.stringify({ type: "welcome", authenticated: ws.data.userId !== null }));
    },
    close(ws) {
      metrics.inc("ws_disconnections_total");
      for (const ch of ws.data.channels) ws.unsubscribe(ch === "user" ? `user:${ws.data.userId}` : ch);
    },
    async message(ws, raw) {
      let msg: { action?: string; channels?: string[]; sinceId?: string };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "invalid json" }));
        return;
      }
      const channels = (msg.channels ?? []).filter((c): c is Channel => CHANNELS.includes(c as Channel));

      if (msg.action === "subscribe") {
        for (const ch of channels) {
          if (ch === "user" && !ws.data.userId) {
            ws.send(JSON.stringify({ type: "error", error: "auth required for user channel" }));
            continue;
          }
          const topic = ch === "user" ? `user:${ws.data.userId}` : ch;
          ws.subscribe(topic);
          ws.data.channels.add(ch);
        }
        ws.send(JSON.stringify({ type: "subscribed", channels: [...ws.data.channels] }));
        if (msg.sinceId) await backfill(ws, msg.sinceId);
      } else if (msg.action === "unsubscribe") {
        for (const ch of channels) {
          ws.unsubscribe(ch === "user" ? `user:${ws.data.userId}` : ch);
          ws.data.channels.delete(ch);
        }
        ws.send(JSON.stringify({ type: "unsubscribed", channels }));
      }
    },
  },
});

async function backfill(
  ws: Bun.ServerWebSocket<SocketData>,
  sinceId: string,
): Promise<void> {
  const entries = (await reader.xRange(STREAMS.output, `(${sinceId}`, "+", { COUNT: 500 })) as Array<{
    id: string;
    message: Record<string, string>;
  }>;
  for (const e of entries) {
    let evt: EngineOutputEvent;
    try {
      evt = decodeOutputEvent(e.message);
    } catch {
      continue;
    }
    if (deliverable(ws, evt)) ws.send(JSON.stringify({ type: "event", streamId: e.id, event: evt }));
  }
}

function deliverable(ws: Bun.ServerWebSocket<SocketData>, evt: EngineOutputEvent): boolean {
  for (const topic of topicsFor(evt)) {
    if (topic === "orderbook" && ws.data.channels.has("orderbook")) return true;
    if (topic === "trades" && ws.data.channels.has("trades")) return true;
    if (topic === `user:${ws.data.userId}` && ws.data.channels.has("user")) return true;
  }
  return false;
}

/** Fan out every engine output event to all instances' subscribers. */
async function consumeOutput(): Promise<void> {
  let lastId = "$";
  for (;;) {
    const res = await reader.xRead({ key: STREAMS.output, id: lastId }, { COUNT: 200, BLOCK: 5000 });
    if (!res) continue;
    const stream = Array.isArray(res) ? res[0] : undefined;
    for (const m of stream?.messages ?? []) {
      lastId = m.id;
      let evt: EngineOutputEvent;
      try {
        evt = decodeOutputEvent(m.message);
      } catch {
        continue;
      }
      const framed = JSON.stringify({ type: "event", streamId: m.id, event: evt });
      for (const topic of topicsFor(evt)) server.publish(topic, framed);
      metrics.inc("ws_events_forwarded_total");
    }
  }
}

log.info("ws server listening", { port: config.ws.port });
void consumeOutput();
