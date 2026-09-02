import type { create_order } from "@repo/types";
import type { Fills, BidAsk } from "../utils/types";

export class OrderBook {
  public Bids = new OrderBookSide("Bid", "desc");
  public Asks = new OrderBookSide("Ask", "asc");

  public maxLevarage = 20;
  public minMargin = 100;

  public lastTradePrice: number = 0;

  getSnapshot(levels = 20) {
    const levelOf = (side: OrderBookSide) =>
      side.arrangedPrice.slice(0, levels).map((price) => ({
        price,
        quantity: (side.maps.get(price) ?? []).reduce(
          (sum, entry) => sum + entry.remainingQuantity,
          0,
        ),
      }));

    return {
      bids: levelOf(this.Bids),
      asks: levelOf(this.Asks),
      lastTradePrice: this.lastTradePrice,
    };
  }
}

class OrderBookSide {
  public side: "Bid" | "Ask";
  public maps: Map<number, BidAsk[]> = new Map();
  public arrangedPrice: number[] = [];
  private sortDirection: "asc" | "desc";

  constructor(side: "Bid" | "Ask", sortDirection: "asc" | "desc") {
    this.side = side;
    this.sortDirection = sortDirection;
  }

  addPrice(price: number) {
    if (this.arrangedPrice.includes(price)) return;

    let insertIndex = this.arrangedPrice.findIndex((existingPrice) =>
      this.sortDirection === "asc"
        ? existingPrice > price
        : existingPrice < price,
    );
    if (insertIndex === -1) insertIndex = this.arrangedPrice.length;

    this.arrangedPrice.splice(insertIndex, 0, price);
  }

  private removePrice(price: number) {
    const index = this.arrangedPrice.indexOf(price);
    if (index !== -1) this.arrangedPrice.splice(index, 1);
  }

  deleteSide(fillMap: Map<string, { match: BidAsk; fillData: Fills }>) {
    for (const [key, value] of fillMap) {
      const price = value.match.price;
      const getBidAsks = this.maps.get(price);
      if (!getBidAsks || getBidAsks.length === 0) {
        continue;
      }

      for (let i = 0; i < getBidAsks.length; i++) {
        const currentBidAsk = getBidAsks[i];

        if (!currentBidAsk) continue;

        if (currentBidAsk.id === key) {
          if (currentBidAsk.remainingQuantity <= 0) {
            getBidAsks.splice(i, 1);

            if (getBidAsks.length === 0) {
              this.maps.delete(price);
              this.removePrice(price);
            }
          }

          break;
        }
      }
    }
  }

  cancelOrder(orderId: string, price: number): BidAsk | undefined {
    const level = this.maps.get(price);
    if (!level) return undefined;

    const index = level.findIndex((entry) => entry.orderId === orderId);
    if (index === -1) return undefined;

    const [removed] = level.splice(index, 1);
    if (level.length === 0) {
      this.maps.delete(price);
      this.removePrice(price);
    }
    return removed;
  }

  addSide(order: create_order) {
    const newBidAsk: BidAsk = {
      id: crypto.randomUUID(),
      userId: order.userId,
      orderId: order.orderId,
      price: order.limitPrice,
      quantity: order.quantity,
      remainingQuantity: order.quantity,
      timeStamp: Date.now(),
      side: this.side,
      type: order.ordertype === "LIMIT" ? "Limit" : "Market",
      lockedCollateral: order.margin,
      leverage: order.leverage,
    };

    const findBidAsk = this.maps.get(order.limitPrice);
    if (!findBidAsk) {
      this.maps.set(order.limitPrice, [newBidAsk]);
      this.addPrice(order.limitPrice);
      return;
    }

    findBidAsk.push(newBidAsk);
  }
}
