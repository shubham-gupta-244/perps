import matchingEngine from "./core/matchingEngine";
import { connectClients } from "./utils/redis";

import type {
  create_order,
  create_user,
  cancel_order,
  add_balance,
  user_balance,
} from "@repo/types";

async function startEngine() {
  // import read and wirte client
  const { readerClient, writerClient } = await connectClients();

  // start loop for listening event from backend
  while (1) {
    const response = await readerClient.xRead(
      { key: "to_engine", id: "0" },
      { COUNT: 1, BLOCK: 100 },
    );

    if (!response) continue;

    // get the event and parse it in json
    const eventPayload = JSON.parse(response[0]?.messages[0]);
    const message = JSON.parse(eventPayload.message);

    try {
      // switch case for multiple event Type
      switch (message.type) {
        case "register_user": {
          const data = message.data as create_user;

          break;
        }

        case "create_order": {
          const data = message.data as create_order;
          const response = matchingEngine.handleOrder(data);
          break;
        }

        case "cancel_order": {
          const data = message.data as cancel_order;

          break;
        }

        case "add_balance": {
          const data = message.data as add_balance;

          break;
        }

        case "user_balance": {
          const data = message.data as user_balance;

          break;
        }
      }
    } catch (e) {}
  }
}

startEngine();
