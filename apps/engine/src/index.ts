import db from "./db/db";
import { connectClients } from "./utils/redis";
import { engineToBackend } from "./utils/sendToBackend";
import { startPriceFeed, lastMarkPrice } from "./utils/priceFeed";
import { requiredMargin } from "./risk/margin";

import type {
  create_order,
  create_user,
  cancel_order,
  add_balance,
  user_balance,
  get_position,
  get_orderbook,
  EngineResponse,
  PositionSnapshot,
} from "@repo/types";

function toPositionSnapshot(userId: string): PositionSnapshot {
  const position = db.positionManager.getUserPosition(userId);
  if (!position) {
    return {
      userId,
      size: 0,
      entryPrice: 0,
      margin: 0,
      leverage: 0,
      liqPrice: 0,
      unrealizedPnl: 0,
      realizedPnl: 0,
      lastMarkPrice,
    };
  }
  return {
    userId,
    size: position.size,
    entryPrice: position.entryPrice,
    margin: position.margin,
    leverage: position.leverage,
    liqPrice: position.liqPrice,
    unrealizedPnl: position.unrealizedPnl,
    realizedPnl: position.realizedPnl,
    lastMarkPrice: position.lastMarkPrice || lastMarkPrice,
  };
}

async function startEngine() {
  // import read and wirte client
  const { readerClient } = await connectClients();
  await startPriceFeed();

  let lastId = "$";

  // start loop for listening event from backend
  while (1) {
    const response = await readerClient.xRead(
      { key: "to_engine", id: lastId },
      { COUNT: 1, BLOCK: 100 },
    );

    if (!response) continue;

    const entry = response[0]?.messages[0];
    if (!entry) continue;
    lastId = entry.id;

    const raw = entry.message.message;
    if (!raw) continue;

    let message: { type: string; data: unknown; loopBackId: string };
    try {
      message = JSON.parse(raw);
    } catch {
      console.error("received malformed message on to_engine stream:", raw);
      continue;
    }

    const { loopBackId } = message;
    const reply = (res: Omit<EngineResponse, "loopBackId">) =>
      engineToBackend({ loopBackId, ...res });

    try {
      // switch case for multiple event Type
      switch (message.type) {
        case "create_user": {
          const data = message.data as create_user;
          db.users.addUser(data.userid, data.usd_Balance ?? 0);
          await reply({ success: true, message: "user registered" });
          break;
        }

        case "create_order": {
          const data = message.data as create_order;

          if (!db.users.hasUser(data.userId)) {
            await reply({ success: false, message: "user does not exist" });
            break;
          }

          if (data.leverage <= 0 || data.leverage > db.orderBook.maxLevarage) {
            await reply({
              success: false,
              message: `leverage must be between 1 and ${db.orderBook.maxLevarage}`,
            });
            break;
          }

          if (data.margin < db.orderBook.minMargin) {
            await reply({
              success: false,
              message: `margin must be at least ${db.orderBook.minMargin}`,
            });
            break;
          }

          const minRequired = requiredMargin(
            data.limitPrice,
            data.quantity,
            data.leverage,
          );
          if (data.margin + 1e-6 < minRequired) {
            await reply({
              success: false,
              message: "margin is insufficient for the requested size and leverage",
            });
            break;
          }

          const locked = db.users.updateLockBalance(
            data.userId,
            data.margin,
            "add",
          );
          if (!locked) {
            await reply({ success: false, message: "insufficient free balance" });
            break;
          }

          const result = db.matchingEngine.handleOrder(data);
          await reply({
            success: true,
            message: `order ${result.status.toLowerCase()}`,
            data: result,
          });
          break;
        }

        case "delete_order":
        case "cancel_order": {
          const data = message.data as cancel_order;
          const removed = db.matchingEngine.cancelOrder(
            data.orderId,
            data.side,
            data.price,
          );
          if (!removed) {
            await reply({
              success: false,
              message: "order not found or already filled/cancelled",
            });
            break;
          }
          const unlockAmount =
            (removed.remainingQuantity / removed.quantity) *
            removed.lockedCollateral;
          db.users.updateLockBalance(data.userId, unlockAmount, "reduce");
          await reply({ success: true, message: "order cancelled" });
          break;
        }

        case "add_balance": {
          const data = message.data as add_balance;
          if (!db.users.hasUser(data.userId)) {
            db.users.addUser(data.userId, 0);
          }
          db.users.creditBalance(data.userId, data.balance);
          await reply({ success: true, message: "balance credited" });
          break;
        }

        case "user_balance": {
          const data = message.data as user_balance;
          if (!db.users.hasUser(data.userId)) {
            await reply({ success: false, message: "user does not exist" });
            break;
          }
          const user = db.users.getUser(data.userId);
          await reply({
            success: true,
            data: {
              userId: user.userId,
              balance: user.balance,
              freeBalance: user.freeBalance,
              lockedBalance: user.lockedBalance,
            },
          });
          break;
        }

        case "get_position": {
          const data = message.data as get_position;
          await reply({ success: true, data: toPositionSnapshot(data.userId) });
          break;
        }

        case "get_orderbook": {
          const data = message.data as get_orderbook;
          await reply({
            success: true,
            data: db.orderBook.getSnapshot(data.levels ?? 20),
          });
          break;
        }

        default: {
          await reply({ success: false, message: "unknown event type" });
        }
      }
    } catch (e) {
      console.error("error handling event", message.type, e);
      await reply({
        success: false,
        message: e instanceof Error ? e.message : "internal engine error",
      });
    }
  }
}

startEngine();
