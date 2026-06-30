import express, { Router } from "express";
import { authMiddleware } from "..//middleware/authMiddleware";
import { userFillsController } from "../controller/fillsController";

const fillsRouter = Router();

fillsRouter.get(
  "/user/fills",authMiddleware,userFillsController,);

export { fillsRouter };
