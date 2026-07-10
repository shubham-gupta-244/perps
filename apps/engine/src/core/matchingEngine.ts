import { Fills } from "../db/fills";
import orderBook from "../db/orderBook";
import { Users } from "../db/user";
import type { create_order } from "@repo/types";

class MatchingEngine {
  private user = new Users();
  private fills = new Fills();

  private matchOpposingOrderBook(
    order: create_order,
    cantMatchPrice: (bestMatchPrice: number) => boolean,
  ): number {
    return 94;
  }

  private processMarketOrder(order: create_order) {
    const opposingSide =
      order.side === "BUY" ? orderBook.Shorts : orderBook.Longs;
    const bestMatchPrice = order.limitPrice;
    const remaingQuantity = this.matchOpposingOrderBook(
      order,
      (bestMatchPrice) => true,
    );
    if (remaingQuantity > 0) {
      // cancel the remaining quantity
    }
  }

  private processLimitOrder(order: create_order) {}

  private generateFills() {}

  public handleOrder(order: create_order) {
    if (order.ordertype === "Market") {
      this.processLimitOrder(order);
    } else {
      this.processMarketOrder(order);
    }
  }
}

const matchingEngine = new MatchingEngine();
export default matchingEngine;
