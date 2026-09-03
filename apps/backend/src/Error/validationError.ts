import { ApiError } from "./apiError";

type Issue = {
  path: string;
  message: string;
};

/** A 400 that carries a structured list of field issues. */
export class ValidationError extends ApiError {
  public issues: Issue[];

  constructor(issues: Issue[], message = "Validation failed") {
    super(400, message, { issues });
    this.issues = issues;
  }
}
