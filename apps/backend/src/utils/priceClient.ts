import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;

async function getClient(): Promise<RedisClientType> {
  if (client) return client;
  client = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  client.on("error", (err) => console.log(err));
  await client.connect();
  return client;
}

export async function getIndexPrice(): Promise<number | null> {
  const reader = await getClient();
  const raw = await reader.get("index_price");
  if (!raw) return null;
  const price = parseFloat(raw);
  return Number.isFinite(price) ? price : null;
}
