import { type RedisClientType } from "redis";
import { createClient } from "redis";

export async function connectClients(): Promise<{
  readerClient: RedisClientType;
  writerClient: RedisClientType;
}> {
  const readerClient = createClient();
  const writerClient = createClient();

  readerClient.on("error", (err) => console.log(err));
  writerClient.on("error", (err) => console.log(err));

  await Promise.all([readerClient.connect(), writerClient.connect()]);
  console.log("both client has been connected");

  return { readerClient, writerClient };
}
