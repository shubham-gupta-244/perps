import { createClient, type RedisClientType } from "redis";
import { config } from "@repo/config";
import { createLogger } from "@repo/logger";

const log = createLogger("redis-streams");

export type Redis = RedisClientType;

export async function createRedis(
  url: string = config.redisUrl,
  name = "client",
): Promise<Redis> {
  const client: RedisClientType = createClient({ url });
  client.on("error", (err) => log.error("redis client error", { name, err: String(err) }));
  client.on("reconnecting", () => log.warn("redis reconnecting", { name }));
  await client.connect();
  log.info("redis connected", { name });
  return client;
}

/** Create the consumer group, tolerating "already exists". */
export async function ensureGroup(
  client: Redis,
  stream: string,
  group: string,
): Promise<void> {
  try {
    await client.xGroupCreate(stream, group, "0", { MKSTREAM: true });
    log.info("consumer group created", { stream, group });
  } catch (err) {
    if (err instanceof Error && err.message.includes("BUSYGROUP")) return;
    throw err;
  }
}
