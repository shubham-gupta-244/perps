import type { create_order } from "@repo/types";
import type { Fills, LongShort } from "../utils/types";

class Fill {
  public fills: Fills[] = [];

  generateFills(order: create_order, availableMatch: LongShort[]) {
    const fillMap: Map<string, { longshort: LongShort; fillData: Fills }> =
      new Map();
    let remainingQuantity = order.quantity;
    let updatedMatches: LongShort[] = [];
    for (let match of availableMatch) {
      if (remainingQuantity <= 0) {
        updatedMatches.push(match);
        continue;
      }
    }
  }
}

const fills = new Fill();
export default fills;
