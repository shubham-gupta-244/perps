import { Users } from "../db/user";
import { PositionManager } from "../positions/positionManager";

export class RiskEngine {
  private users: Users;
  private positionManager: PositionManager;

  constructor(users: Users, positionManager: PositionManager) {
    this.users = users;
    this.positionManager = positionManager;
  }
}
