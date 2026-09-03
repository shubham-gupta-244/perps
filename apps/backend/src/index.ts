declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | { userId: string };
    }
  }
}
import express from "express";
import cors from "cors";
import type { JwtPayload } from "jsonwebtoken";
import { authRouter } from "./routes/auth";
import { orderRouter } from "./routes/order";
import { fillsRouter } from "./routes/fill";
import { walletRouter } from "./routes/wallet";
import { marketRouter } from "./routes/market";
import { globalErrorHandler } from "./middleware/globalErrorHandler";
import { initEngineClient } from "./engine/client";
import { config } from "@repo/config";
import { createLogger, metrics } from "@repo/logger";

const log = createLogger("api");
const app = express();

app.use(express.json());
app.use(cors());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
app.get("/metrics", (_req, res) => {
  res.type("text/plain").send(metrics.prometheus());
});

app.use(authRouter);
app.use(orderRouter);
app.use(fillsRouter);
app.use(walletRouter);
app.use(marketRouter);

app.use(globalErrorHandler);

await initEngineClient();

app.listen(config.api.port, () => {
  log.info("api listening", { port: config.api.port });
});
