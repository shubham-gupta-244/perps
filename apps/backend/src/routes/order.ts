import { Router } from "express";

import {
  deleteOrder,
  OrderController,
  orderHistory,
} from "../controller/orderController";
import { authMiddleware } from "../middleware/authMiddleware";
const orderRouter = Router();

orderRouter.post("/order", authMiddleware, OrderController);
orderRouter.get("/order/history", authMiddleware,orderHistory);
orderRouter.delete("/order", authMiddleware, deleteOrder);

export { orderRouter };
