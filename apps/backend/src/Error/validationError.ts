type Issue = {
  path: string;
  message: string;
};

export class ValidationError extends Error {
  public issues: Issue[];

  constructor(issues: Issue[], message = "Validation failed") {
    super(message);

    this.name = "ValidationError";
    this.issues = issues;

    // Fix prototype chain (important in TS/JS)
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}