import type { create_order } from "@repo/types";
import type { Fills, BidAsk } from "../utils/types";

export class Fill {
  public fills: Fills[] = [];

  generateFills(order: create_order, availableMatch: BidAsk[]) {
    const fillMap: Map<string, { match: BidAsk; fillData: Fills }> = new Map();
    let remainingQuantity = order.quantity;

    for (const match of availableMatch) {
      if (remainingQuantity <= 0) break;

      const filledQuantity =
        remainingQuantity >= match.remainingQuantity
          ? match.remainingQuantity
          : remainingQuantity;

      if (filledQuantity <= 0) continue;

      match.remainingQuantity -= filledQuantity;
      remainingQuantity -= filledQuantity;

      const fillData: Fills = {
        makerId: match.userId,
        takerId: order.userId,
        makerOrderId: match.orderId,
        takerOrderId: order.orderId,
        price: match.price,
        qunatity: filledQuantity,
        createdAt: new Date(),
      };

      this.fills.push(fillData);
      fillMap.set(match.id, { match, fillData });
    }

    return { fillMap, remainingQuantity };
  }
}
