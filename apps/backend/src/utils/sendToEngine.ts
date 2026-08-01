import type { payload } from "@repo/types";
import { readerClient, writerClient } from "..";

type PendingRequest = {
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<string, PendingRequest>();

export async function sendToStream(event: payload): Promise<unknown> {
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

    let parsed: { loopBackId: string; data: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("received malformed message from_engine stream:", raw);
      continue;
    }

    const pending = pendingRequests.get(parsed.loopBackId);
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve(parsed.data);
      pendingRequests.delete(parsed.loopBackId);
    }
  }
}

main();
