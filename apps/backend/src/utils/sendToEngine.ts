import type { payload, EngineResponse } from "@repo/types";
import { createClient, type RedisClientType } from "redis";

let readerClient: RedisClientType | null = null;
let writerClient: RedisClientType | null = null;

async function getClients() {
  if (readerClient && writerClient) return { readerClient, writerClient };
  readerClient = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  writerClient = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  readerClient.on("error", (err) => console.log(err));
  writerClient.on("error", (err) => console.log(err));
  await Promise.all([readerClient.connect(), writerClient.connect()]);
  return { readerClient, writerClient };
}

type PendingRequest = {
  resolve: (value: Omit<EngineResponse, "loopBackId"> | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<string, PendingRequest>();

export async function sendToStream(
  event: payload,
): Promise<Omit<EngineResponse, "loopBackId"> | null> {
  const { writerClient } = await getClients();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pendingRequests.delete(event.loopBackId)) {
        resolve(null);
      }
    }, 10000);

    pendingRequests.set(event.loopBackId, { resolve, timer });

    writerClient
      .xAdd("to_engine", "*", { message: JSON.stringify(event) })
      // if it fails to write to stream the cleanup logic should run
      .catch(() => {
        clearTimeout(timer);
        if (pendingRequests.delete(event.loopBackId)) {
          resolve(null);
        }
      });
  });
}

async function main() {
  const { readerClient } = await getClients();
  let lastId = "$";
  while (true) {
    const response = await readerClient.xRead(
      { key: "from_engine", id: lastId },
      { COUNT: 1, BLOCK: 100 },
    );
    if (!response) continue;

    const entry = response[0]?.messages[0];
    if (!entry) continue;
    lastId = entry.id;

    const raw = entry.message.message;
    if (!raw) continue;

    let parsed: EngineResponse;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("received malformed message from_engine stream:", raw);
      continue;
    }

    const pending = pendingRequests.get(parsed.loopBackId);
    if (pending) {
      clearTimeout(pending.timer);
      const { loopBackId, ...rest } = parsed;
      pending.resolve(rest);
      pendingRequests.delete(parsed.loopBackId);
    }
  }
}

main();
