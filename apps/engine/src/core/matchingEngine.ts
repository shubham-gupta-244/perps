import type { create_order } from "@repo/types";
import type { BidAsk, Fills } from "../utils/types";
import { OrderBook } from "../db/orderBook";
import { Fill } from "../db/fills";
import { PositionManager } from "../positions/positionManager";
import type { Users } from "../db/user";

export type OrderResult = {
  status: "FILLED" | "PARTIAL" | "OPEN" | "CANCELLED";
  filledQuantity: number;
  remainingQuantity: number;
  avgFillPrice: number;
  fills: Fills[];
};

export class MatchingEngine {
  private orderBook: OrderBook;
  private fills: Fill;
  private positionManager: PositionManager;
  private users: Users;

  constructor(
    orderBook: OrderBook,
    fills: Fill,
    positionManager: PositionManager,
    users: Users,
  ) {
    this.orderBook = orderBook;
    this.fills = fills;
    this.positionManager = positionManager;
    this.users = users;
  }

  private matchOpposingOrderBook(
    order: create_order,
    cantMatchPrice: (bestMatchPrice: number) => boolean,
  ): {
    remaingQuantity: number;
    filledQuantity: number;
    notional: number;
    fills: Fills[];
  } {
    // get the best ask and bids from oderbook
    let remaingQuantity = order.quantity;
    let availableMatch: BidAsk[] = [];

    const opposingSide =
      order.side === "Bid" ? this.orderBook.Asks : this.orderBook.Bids;

    // returns an array that has all the price in ascending or desceding order based on buy or sell
    const opposingPrice = opposingSide.arrangedPrice;

    outer: for (const price of opposingPrice) {
      //function which is taken as an input in top level matching function , it take a number as a input and checks wheather the number is greater than or less than orderPrice and return true or false
      if (!cantMatchPrice(price)) {
        break;
      }

      const getMatch = opposingSide.maps.get(price) ?? [];

      if (getMatch.length === 0) continue;

      for (const match of getMatch) {
        if (remaingQuantity <= 0) {
          break outer;
        }

        remaingQuantity -=
          remaingQuantity > match.remainingQuantity
            ? match.remainingQuantity
            : remaingQuantity;
        availableMatch.push(match);
      }
    }

    let filledQuantity = 0;
    let notional = 0;
    const fills: Fills[] = [];

    if (availableMatch.length > 0) {
      const fillResult = this.fills.generateFills(order, availableMatch);
      remaingQuantity = fillResult.remainingQuantity;
      filledQuantity = order.quantity - remaingQuantity;

      for (const { fillData } of fillResult.fillMap.values()) {
        notional += fillData.price * fillData.qunatity;
        this.orderBook.lastTradePrice = fillData.price;
        fills.push(fillData);
      }

      this.positionManager.generatePositions(fillResult.fillMap, order);
      // create positions

      const removeMatchOrder =
        order.side === "Bid"
          ? this.orderBook.Asks.deleteSide(fillResult.fillMap)
          : this.orderBook.Bids.deleteSide(fillResult.fillMap);
    }

    return { remaingQuantity, filledQuantity, notional, fills };
  }

  // function manage the marketOrder
  private processMarketOrder(order: create_order): OrderResult {
    const { remaingQuantity, filledQuantity, notional, fills } =
      this.matchOpposingOrderBook(order, () => true);

    if (remaingQuantity > 0) {
      const unusedMargin = (remaingQuantity / order.quantity) * order.margin;
      if (unusedMargin > 0) {
        this.users.updateLockBalance(order.userId, unusedMargin, "reduce");
      }
    }

    return {
      status: filledQuantity === 0 ? "CANCELLED" : remaingQuantity > 0 ? "PARTIAL" : "FILLED",
      filledQuantity,
      remainingQuantity: remaingQuantity,
      avgFillPrice: filledQuantity > 0 ? notional / filledQuantity : 0,
      fills,
    };
  }

  private processLimitOrder(order: create_order): OrderResult {
    const { remaingQuantity, filledQuantity, notional, fills } =
      this.matchOpposingOrderBook(order, (bestMatchPrice) => {
        return order.side === "Bid"
          ? bestMatchPrice <= order.limitPrice
          : bestMatchPrice >= order.limitPrice;
      });

    if (remaingQuantity > 0) {
      const remainingMargin = (remaingQuantity / order.quantity) * order.margin;
      const orderForBook = {
        ...order,
        quantity: remaingQuantity,
        margin: remainingMargin,
      };
      // add the remainig quantity to orderbook
      const addSide =
        order.side === "Bid"
          ? this.orderBook.Bids.addSide(orderForBook)
          : this.orderBook.Asks.addSide(orderForBook);
    }

    return {
      status:
        filledQuantity === 0
          ? "OPEN"
          : remaingQuantity > 0
            ? "PARTIAL"
            : "FILLED",
      filledQuantity,
      remainingQuantity: remaingQuantity,
      avgFillPrice: filledQuantity > 0 ? notional / filledQuantity : 0,
      fills,
    };
  }

  // function handles the order function
  public handleOrder(order: create_order): OrderResult {
    if (order.ordertype === "LIMIT") {
      return this.processLimitOrder(order);
    }
    return this.processMarketOrder(order);
  }

  public cancelOrder(
    orderId: string,
    side: "Bid" | "Ask",
    price: number,
  ): BidAsk | undefined {
    return side === "Bid"
      ? this.orderBook.Bids.cancelOrder(orderId, price)
      : this.orderBook.Asks.cancelOrder(orderId, price);
  }
}
