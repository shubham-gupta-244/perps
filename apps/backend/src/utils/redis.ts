import { createClient, type RedisClientType } from "redis";

export async function connectClient(): Promise<{
  readerClient: RedisClientType;
  writerClient: RedisClientType;
}> {
  const readerClient = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  const writerClient = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });

  readerClient.on("error", (err) => {
    console.log(err);
  });
  writerClient.on("error", (err) => {
    console.log(err);
  });

  await Promise.all([readerClient.connect(), writerClient.connect()]);

  return { readerClient, writerClient };
}
