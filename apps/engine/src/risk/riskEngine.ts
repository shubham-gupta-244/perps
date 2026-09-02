import { Users } from "../db/user";
import { PositionManager } from "../positions/positionManager";
import { isLiquidatable } from "./liquidation";

export class RiskEngine {
  private users: Users;
  private positionManager: PositionManager;

  constructor(users: Users, positionManager: PositionManager) {
    this.users = users;
    this.positionManager = positionManager;
  }

  canLockMargin(userId: string, margin: number): boolean {
    if (!this.users.hasUser(userId)) return false;
    const user = this.users.getUser(userId);
    return user.freeBalance >= margin;
  }

  runLiquidationSweep(markPrice: number) {
    const liquidated: string[] = [];
    for (const position of this.positionManager.allPositions()) {
      if (position.size === 0) continue;
      const side = position.size > 0 ? "LONG" : "SHORT";
      if (isLiquidatable(markPrice, position.liqPrice, side)) {
        this.positionManager.forceClose(position.userId, markPrice);
        liquidated.push(position.userId);
      }
    }
    return liquidated;
  }
}
