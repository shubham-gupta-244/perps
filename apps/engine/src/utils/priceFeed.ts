import { createClient, type RedisClientType } from "redis";
import db from "../db/db";

let client: RedisClientType | null = null;
export let lastMarkPrice = 0;

async function getClient(): Promise<RedisClientType> {
  if (client) return client;
  client = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  client.on("error", (err) => console.log(err));
  await client.connect();
  return client;
}

export async function startPriceFeed(intervalMs = 2000) {
  const reader = await getClient();
  setInterval(async () => {
    const raw = await reader.get("index_price");
    if (!raw) return;
    const price = parseFloat(raw);
    if (!Number.isFinite(price) || price <= 0) return;

    lastMarkPrice = price;
    db.positionManager.updateUnrealizedPnl(price);
    db.riskEngine.runLiquidationSweep(price);
  }, intervalMs);
}
