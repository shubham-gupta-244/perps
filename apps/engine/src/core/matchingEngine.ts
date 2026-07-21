import db from "../db";
import type { create_order } from "@repo/types";
import type { LongShort } from "../utils/types";

class MatchingEngine {
  private matchOpposingOrderBook(
    order: create_order,
    cantMatchPrice: (bestMatchPrice: number) => boolean,
  ): number {
    // get the best ask and bids from oderbook
    let remaingQuantity = order.quantity;
    let availableMatch: LongShort[] = [];

    // if the order side buy then best match should be find from Shorts and  viceversa
    const opposingSide =
      order.side === "BUY" ? db.orderBook.Shorts : db.orderBook.Longs;
    const opposingPrice =
      order.side === "BUY" ? db.orderBook.shortPrice : db.orderBook.longPrice;

    // run the loop until the quantity is greater than 0
    while (remaingQuantity > 0) {
      outer: for (const price of opposingPrice) {
        //function which is taken as an input in top level matching function , it take a number as a input and checks wheather the number is greater than or less than orderPrice and return true or false
        if (!cantMatchPrice(price)) {
          break;
        }

        // get all the longs and shorts present at that price
        const getMatch = opposingSide.maps.get(price) ?? [];

        if (!getMatch || getMatch.length === 0) continue;

        // iterate over all the longs and shorts which you fetched from from orderbook
        for (const match of getMatch) {
          // if the quantity needed by order is greater than the quantity in current long/short eat the whole LongShot orderwise reduce the quantity of particular long and short by quantityneeded
          if (remaingQuantity > 0) {
            remaingQuantity -=
              remaingQuantity > match.quantity
                ? match.quantity
                : remaingQuantity;
            availableMatch.push(match);
          } else {
            break outer;
          }
        }
      }

      const fillMap = db.fills.generateFills(order, availableMatch);
    }

    // generate the fills

    // generate the positions

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
        return order.side === "BUY"
          ? bestMatchPrice <= order.limitPrice
          : bestMatchPrice >= order.limitPrice;
      },
    );
    if (remaingQuantity > 0) {
      // add the remainig quantity to orderbook
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
