import { createClient, type RedisClientType } from "redis";

export async function connectClient(): Promise<{
  readerClient: RedisClientType;
  writerClient: RedisClientType;
}> {
  const readerClient = createClient();
  const writerClient = createClient();

  readerClient.on("error", (err) => {
    console.log(err);
  });
  writerClient.on("error", (err) => {
    console.log(err);
  });

  await Promise.all([readerClient.connect(), writerClient.connect()]);

  return { readerClient, writerClient };
}
