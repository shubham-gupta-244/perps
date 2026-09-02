import { OrderBook } from "./orderBook";
import { Users } from "./user";
import { PositionManager } from "../positions/positionManager";
import { RiskEngine } from "../risk/riskEngine";
import { MatchingEngine } from "../core/matchingEngine";
import { Fill } from "./fills";

const orderBook = new OrderBook();
const users = new Users();
const positionManager = new PositionManager(users);
// passing a class as an argument in another class is also known as dependency injection rather than importing a instance of class at multiple place just import everthing in a single file and pass them to eachother as per dependency of class
const riskEngine = new RiskEngine(users, positionManager);
const fills = new Fill();
const matchingEngine = new MatchingEngine(orderBook, fills, positionManager, users);

const db = {
  orderBook,
  users,
  fills,
  riskEngine,
  matchingEngine,
  positionManager,
};

export default db;
