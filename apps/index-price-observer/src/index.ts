import { createRedis, StreamProducer } from "@repo/redis-streams";
import { config, STREAMS } from "@repo/config";
import { createLogger, metrics } from "@repo/logger";
import { encodeEvent, newEventId, SCHEMA_VERSION, type IndexPriceUpdatedEvent } from "@repo/events";
import { connectBinance } from "./binance";

const log = createLogger("index-price-observer");

async function main() {
  const redis = await createRedis(config.redisUrl, "observer");
  const input = new StreamProducer(redis, STREAMS.input);

  let lastEmittedAt = 0;
  let lastSeq = 0;

  connectBinance(config.observer.binanceWsUrl, (tick) => {
    const now = Date.now();
    if (now - lastEmittedAt < config.observer.minIntervalMs) return;
    // observerSeq must be strictly monotonic across restarts; Binance event
    // time is non-decreasing, so nudge forward on ties.
    const observerSeq = tick.eventTime > lastSeq ? tick.eventTime : lastSeq + 1;
    lastSeq = observerSeq;
    lastEmittedAt = now;

    const event: IndexPriceUpdatedEvent = {
      eventId: newEventId("idx"),
      eventType: "index_price.updated",
      ts: now,
      source: "index-price-observer",
      schemaVersion: SCHEMA_VERSION,
      payload: {
        symbol: config.symbol,
        price: tick.indexPrice,
        observerSeq,
        sourceTs: tick.eventTime,
      },
    };

    input
      .add(encodeEvent(event))
      .then(() => {
        metrics.inc("observer_ticks_emitted_total");
        return redis.set("index_price", String(tick.indexPrice));
      })
      .catch((err) => log.error("failed to emit index price", { err: String(err) }));
  });

  Bun.serve({
    port: config.ws.port + 1,
    fetch(req) {
      if (new URL(req.url).pathname === "/metrics")
        return new Response(metrics.prometheus(), { headers: { "content-type": "text/plain" } });
      return new Response("ok");
    },
  });

  log.info("observer running", { symbol: config.symbol });
}

main().catch((err) => {
  log.error("fatal", { err: String(err) });
  process.exit(1);
});
