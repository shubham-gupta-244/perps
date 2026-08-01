declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | { userId: string };
    }
  }
}
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { orderRouter } from "./routes/order";
import type { JwtPayload } from "jsonwebtoken";
import { fillsRouter } from "./routes/fill";
import { marketRouter } from "./routes/market";
import { connectClient } from "./utils/redis";
import { globalErrorHandler } from "./middleware/globalErrorHandler";

const app = express();

app.use(express.json());
app.use(cors());

app.use(authRouter);
app.use(orderRouter);
app.use(fillsRouter);
app.use(marketRouter);

app.use(globalErrorHandler);

const { readerClient, writerClient } = await connectClient();
console.log("clinet connected");
export { readerClient, writerClient };

app.listen(3000, () => {
  console.log("server is running on port 3000");
});
