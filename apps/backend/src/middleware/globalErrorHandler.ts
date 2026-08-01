import type { NextFunction, Request, Response } from "express";
import { ValidationError } from "../Error/validationError";

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof ValidationError) {
    res.status(400).json({ message: err.message, issues: err.issues });
    return;
  }

  console.error(err);
  res.status(500).json({ message: "internal server error" });
}
