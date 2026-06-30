import { readerClient } from "./redis";
import { writerClinet } from "./redis";
import type { payload } from "@repo/types";

const storeResolve = new Map<string, (value: unknown) => void>();

export async function sendToStream(event: payload) {
  return new Promise(async (resolve, reject) => {
    const eventToSend = JSON.stringify(event);
    const response = await writerClinet.xAdd("to_engine", "*", { eventToSend });
    storeResolve.set(event.loopBackId, resolve);
    setTimeout(() => {
      if (storeResolve.get(event.loopBackId)) {
        reject();
      }
    }, 10000);
  });
}

async function main() {
  while (true) {
    const response = await readerClient.xRead(
      { key: "from_engine", id: "$" },
      {
        COUNT: 1,
        BLOCK: 100,
      },
    );
    if (!response) continue;
    //@ts-ignore
    const responsePayload = JSON.parse(response[0]?.message[0]);
    const message = responsePayload.message;
    const fn = storeResolve.get(message.loopBackId) as (value: unknown) => void;
    if (fn) {
      fn(message.data);
    }
    storeResolve.delete(message.loopBackId);
  }
}

main();
