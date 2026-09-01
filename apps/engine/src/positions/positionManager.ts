import type { create_order } from "@repo/types";
import type { BidAsk, Fills } from "../utils/types";
import { Position } from "./postitons";
import type { Users } from "../db/user";

export class PositionManager {
  private positions: Map<string, Position> = new Map();
  private users: Users;
  constructor(users: Users) {
    this.users = users;
  }
  generatePositions(
    fillMap: Map<string, { match: BidAsk; fillData: Fills }>,
    order: create_order,
  ) {
    for (const [key, value] of fillMap.entries()) {
      const { match, fillData } = value;
      const makerMargin =
        (fillData.qunatity / match.quantity) * match.lockedCollateral;

      const takerMargin = (fillData.qunatity / order.quantity) * order.margin;

      // maker leg of the fill
      this.applyFill(
        match.userId,
        match.side,
        fillData.price,
        fillData.qunatity,
        makerMargin,
      );
      // taker leg of the fill
      this.applyFill(
        order.userId,
        order.side,
        fillData.price,
        fillData.qunatity,
        takerMargin,
      );
    }
  }

  private applyFill(
    userId: string,
    side: "Bid" | "Ask",
    price: number,
    quantity: number,
    margin: number,
  ) {
    // first check if the user already holds a position or not, if not
    // create a new one and use it for the update below
    let position = this.positions.get(userId);
    if (!position) {
      position = new Position(userId);
      this.positions.set(userId, position);
    }

    const signedQuantity = side === "Bid" ? quantity : -quantity;

    if (position.size === 0) {
      position.entryPrice = price;
      position.size = signedQuantity;
      position.margin = margin;
      return;
    }

    if (Math.sign(position.size) === Math.sign(signedQuantity)) {
      const existingNotionalValue =
        Math.abs(position.size) * position.entryPrice;
      const fillNotional = quantity * price;
      const newSize = Math.abs(position.size) + quantity;
      position.entryPrice = (existingNotionalValue + fillNotional) / newSize;
      const newMargin = position.margin + margin;
      position.margin = newMargin;
    }

    // reducing , closing and flipping the position

    if (Math.sign(position.size) !== Math.sign(signedQuantity)) {
      const absPos = Math.abs(position.size);
      const absTrade = Math.abs(signedQuantity);

      // reduce the position
      if (absPos > absTrade) {
        const pnl =
          (price - position.entryPrice) *
          (position.size > 0 ? quantity : -quantity);

        position.realizedPnl += pnl;
        const marginReleasd = (quantity / absPos) * position.margin;
        const updated = this.users.updateLockBalance(
          userId,
          marginReleasd,
          "reduce",
        );
        if (updated) {
          position.margin -= marginReleasd;
        }

        // close the position
      }

      if (absPos === absTrade) {
        const pnl = (price - position.entryPrice) * position.size;
        position.realizedPnl += pnl;
        const updated = this.users.updateLockBalance(
          userId,
          position.margin,
          "reduce",
        );
        if (updated) {
          position.margin = 0;
        }
      }

      // flip the position
      if (absPos < absTrade) {
        const pnl = (price - position.entryPrice) * position.size;
        position.realizedPnl += pnl;

        // open new position with remaining quantity
        const remaining = absTrade - absPos;
        position.size = signedQuantity > 0 ? remaining : -remaining;
        position.entryPrice = price;
        const updated1 = this.users.updateLockBalance(
          userId,
          position.margin,
          "reduce",
        );
        if (updated1) {
          position.margin = 0;
        }
        const newMargin = (remaining / quantity) * margin;
        const updated2 = this.users.updateLockBalance(userId, newMargin, "add");
        if (updated2) {
          position.margin = newMargin;
        }
        return;
      }
    }
    position.size += signedQuantity;
  }

  getUserPosition(userId: string) {}

  updateUnrealizedPnl(indexPrice: number) {
    for (const [key, value] of this.positions) {
      if (value.size === 0) {
        value.unrealizedPnl = 0;
      }
      const unrealizePnl = (indexPrice - value.entryPrice) * value.size;
      value.unrealizedPnl = unrealizePnl;
      value.lastMarkPrice = indexPrice;
    }
  }
}

// size
// margin
// enteryprice
// liquidationPrice
// realizedPnl
// lastMarketPice
