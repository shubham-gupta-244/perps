import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "@repo/config";
import { UnauthorizedError } from "../Error/apiError";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("missing bearer token");
  }
  const token = authHeader.slice("Bearer ".length);

  try {
    req.user = jwt.verify(token, config.api.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw new UnauthorizedError("invalid or expired token");
  }
  next();
}
