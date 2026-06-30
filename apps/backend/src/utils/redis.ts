import { createClient } from "redis";
export const writerClinet = createClient();
export const readerClient = createClient();

await writerClinet.connect();
console.log("writerClient has been connected");
await readerClient.connect();
console.log("readerClient has been connected");
