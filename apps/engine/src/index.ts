import { createRedis } from "@repo/redis-streams";
import { config } from "@repo/config";
import { createLogger, metrics } from "@repo/logger";
import { SnapshotStore } from "./snapshot";
import { EngineRuntime } from "./runtime";

const log = createLogger("engine", { consumer: config.engine.consumerName });

async function main() {
  log.info("engine starting", { symbol: config.symbol });

  const [input, output, query] = await Promise.all([
    createRedis(config.redisUrl, "engine-input"),
    createRedis(config.redisUrl, "engine-output"),
    createRedis(config.redisUrl, "engine-query"),
  ]);

  const store = new SnapshotStore(config.engine.snapshotDir, config.engine.snapshotRetain);
  const runtime = new EngineRuntime({ input, output, query, store });

  await runtime.recover();

  const shutdown = async (sig: string) => {
    log.info("shutting down", { sig });
    await runtime.stop();
    await Promise.all([input.destroy(), output.destroy(), query.destroy()]);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // tiny metrics endpoint
  Bun.serve({
    port: config.api.port + 100,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/health") return new Response("ok");
      if (url.pathname === "/metrics")
        return new Response(metrics.prometheus(), {
          headers: { "content-type": "text/plain" },
        });
      return new Response("not found", { status: 404 });
    },
  });

  await runtime.runLive();
}

main().catch((err) => {
  createLogger("engine").error("fatal", { err: String(err) });
  process.exit(1);
});
