import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { getBalance, getPosition } from "../controller/walletController";

const walletRouter = Router();

walletRouter.get("/wallet/balance", authMiddleware, getBalance);
walletRouter.get("/position", authMiddleware, getPosition);

export { walletRouter };
