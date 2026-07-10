import { Position } from "./postitons";
import { RiskEngine } from "../risk/riskEngine";
export class PositionManager {
  private positions: Map<string, Position> = new Map();

  constructor(riskEngine: RiskEngine) {}

  private key(userId: string, marketId: string) {}
}
