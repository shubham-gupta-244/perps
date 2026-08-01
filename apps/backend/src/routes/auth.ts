import { Router } from "express";
import { signupcontroller } from "../controller/authController";
import { loginController } from "../controller/authController";
import { onrampController } from "../controller/onrampController";
import { authMiddleware } from "../middleware/authMiddleware";

const authRouter = Router();

authRouter.post("/api/v1/signup", signupcontroller);
authRouter.post("/api/v1/login", loginController);
authRouter.post("/api/v1/onramp", authMiddleware, onrampController);

export { authRouter };
