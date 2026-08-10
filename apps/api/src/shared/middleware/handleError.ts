import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../AppError.js";

export const handleError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res
      .status(422)
      .json({ message: "Validation failed", details: err.flatten() });
    return;
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
};
