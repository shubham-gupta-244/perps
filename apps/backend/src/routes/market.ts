import { Router } from "express";
import { getMarkets } from "../controller/marketController";
const marketRouter = Router();
marketRouter.get("/supported/market", getMarkets);

export { marketRouter };
