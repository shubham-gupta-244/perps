import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../Error/apiError";
import { createLogger } from "@repo/logger";

const log = createLogger("api");

/**
 * The single place errors become HTTP responses.
 *
 * Express 5 auto-forwards rejected promises from async handlers here, so
 * controllers throw typed errors (ApiError / ValidationError) or let a
 * `schema.parse()` throw a ZodError, and never format error responses
 * themselves. Must stay last in the middleware chain and keep the 4-arg
 * signature so Express recognises it as error middleware.
 */
export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    res.status(400).json({ message: "invalid request body", issues: err.issues });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({ message: err.message, ...err.details });
    return;
  }

  log.error("unhandled error", { err: err instanceof Error ? err.stack : String(err) });
  res.status(500).json({ message: "internal server error" });
}
