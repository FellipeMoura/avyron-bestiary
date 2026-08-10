/**
 * Domain error carrying an HTTP status. The `handleError` middleware converts
 * it to a `{ message, details? }` JSON response. Follows the frostie pattern.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}
