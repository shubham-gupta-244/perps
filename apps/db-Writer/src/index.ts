import { createRedis, StreamConsumer } from "@repo/redis-streams";
import { config, STREAMS, GROUPS } from "@repo/config";
import { createLogger, metrics } from "@repo/logger";
import { decodeOutputEvent } from "@repo/events";
import { project } from "./projector";

const log = createLogger("db-poller");

async function main() {
  const redis = await createRedis(config.redisUrl, "db-poller");

  const consumer = new StreamConsumer({
    client: redis,
    stream: STREAMS.output,
    group: GROUPS.dbPoller,
    consumer: `db-poller-${process.pid}`,
  });

  const shutdown = () => {
    log.info("stopping");
    consumer.stop();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  Bun.serve({
    port: config.ws.port + 2,
    fetch(req) {
      if (new URL(req.url).pathname === "/metrics")
        return new Response(metrics.prometheus(), { headers: { "content-type": "text/plain" } });
      return new Response("ok");
    },
  });

  log.info("db-poller consuming", { stream: STREAMS.output, group: GROUPS.dbPoller });
  await consumer.start(async (msg) => {
    const evt = decodeOutputEvent(msg.fields);
    await project(evt, msg.id);
    metrics.inc("db_poller_projected_total");
  });
}

main().catch((err) => {
  log.error("fatal", { err: String(err) });
  process.exit(1);
});
