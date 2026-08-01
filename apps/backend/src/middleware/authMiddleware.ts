import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  try {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "invalid token or token is not available" });
      return;
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
      res.status(401).json({ message: "token is not present" });
      return;
    }

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as jwt.JwtPayload;
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ message: "invalid or expired token" });
  }
}
