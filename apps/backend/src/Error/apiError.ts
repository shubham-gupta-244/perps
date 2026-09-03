/**
 * Base class for every error a controller is allowed to throw.
 *
 * Express 5 forwards a rejected promise from an async handler straight to the
 * error middleware, so controllers just `throw new NotFoundError(...)` and
 * `globalErrorHandler` turns it into the response. `details` is merged into the
 * JSON body (e.g. `{ orderId }`).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends ApiError {
  constructor(message = "bad request", details?: Record<string, unknown>) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "unauthorized") {
    super(401, message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "not found") {
    super(404, message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "conflict", details?: Record<string, unknown>) {
    super(409, message, details);
  }
}

export class GatewayTimeoutError extends ApiError {
  constructor(message = "upstream did not respond in time", details?: Record<string, unknown>) {
    super(504, message, details);
  }
}
