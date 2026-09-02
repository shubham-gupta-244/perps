import { Router } from "express";
import { getOrderBook, getPrice } from "../controller/marketController";

const marketRouter = Router();

marketRouter.get("/market/price", getPrice);
marketRouter.get("/market/orderbook", getOrderBook);

export { marketRouter };
