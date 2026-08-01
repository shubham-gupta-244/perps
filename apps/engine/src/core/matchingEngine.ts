import db from "../db";
import type { create_order } from "@repo/types";
import type { BidAsk } from "../utils/types";
import orderBook from "../db/orderBook";

class MatchingEngine {
  private matchOpposingOrderBook(
    order: create_order,
    cantMatchPrice: (bestMatchPrice: number) => boolean,
  ): number {
    // get the best ask and bids from oderbook
    let remaingQuantity = order.quantity;
    let availableMatch: BidAsk[] = [];

    const opposingSide =
      order.side === "Bid" ? db.orderBook.Asks : db.orderBook.Bids;

    // returns an array that has all the price in ascending or desceding order based on buy or sell
    const opposingPrice = opposingSide.arrangedPrice;

    // single pass over price levels, best to worst; stop early once filled
    // or once a price no longer satisfies the order
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

    if (availableMatch.length > 0) {
      // generate the fills (this also decrements each match's remainingQuantity)
      const fillResult = db.fills.generateFills(order, availableMatch);
      remaingQuantity = fillResult.remainingQuantity;

      // create positions

      const removeMatchOrder =
        order.side === "Bid"
          ? orderBook.Asks.deleteSide(fillResult.fillMap)
          : orderBook.Bids.deleteSide(fillResult.fillMap);
    }

    return remaingQuantity;
  }

  // function manage the marketOrder
  private processMarketOrder(order: create_order) {
    const bestMatchPrice = order.limitPrice;
    const remaingQuantity = this.matchOpposingOrderBook(
      order,
      (bestMatchPrice) => true,
    );
    if (remaingQuantity > 0) {
      // cancel the remaining quantity
    }
  }

  private processLimitOrder(order: create_order) {
    const remaingQuantity = this.matchOpposingOrderBook(
      order,
      (bestMatchPrice) => {
        return order.side === "Bid"
          ? bestMatchPrice <= order.limitPrice
          : bestMatchPrice >= order.limitPrice;
      },
    );
    if (remaingQuantity > 0) {
      const orderForBook = order;
      orderForBook.quantity = remaingQuantity;
      // add the remainig quantity to orderbook
      const addSide =
        order.side === "Bid"
          ? orderBook.Bids.addSide(orderForBook)
          : orderBook.Asks.addSide(orderForBook);
    }
  }

  // function handles the order function
  public handleOrder(order: create_order) {
    if (order.ordertype === "LIMIT") {
      this.processLimitOrder(order);
    } else {
      this.processMarketOrder(order);
    }
  }
}

const matchingEngine = new MatchingEngine();
export default matchingEngine;
