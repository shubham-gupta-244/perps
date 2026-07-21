import { Position } from "./postitons";
import riskEngine, { type RiskEngine } from "../risk/riskEngine";

class PositionManager {
  private positions: Map<string, Position> = new Map();
  private riskEngine: RiskEngine;

  constructor(riskEngine: RiskEngine) {
    this.riskEngine = riskEngine;
  }

  private key(userId: string, marketId: string) {}
}

const positionManager = new PositionManager(riskEngine);
export default positionManager;
