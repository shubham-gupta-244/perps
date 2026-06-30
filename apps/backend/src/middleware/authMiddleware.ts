import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  try {
    if (!authHeader || !authHeader.startsWith(" Bearer")) {
      res.status(404).json("invalid token or token is not available");
      return;
    }
    const token = authHeader.split(" ")[1];
    if (!token || typeof token !== "string") {
      res.status(404).json({ message: "token is not present" });
    }

    const payload = jwt.verify(
      token as string,
      process.env.JWT_SECRET as string,
    ) as jwt.JwtPayload;
    req.user = payload;
    next();
  } catch (e) {
    console.log("error while ");
  }
}
