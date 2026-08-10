import type { RequestHandler } from "express";
import { env } from "../../env.js";
import { AppError } from "../AppError.js";

/**
 * The only auth in the app: a static header key on write routes. Reads are
 * open. Compare with a constant-time helper to keep timing attacks off the
 * table even though the surface is tiny.
 */
export const requireApiKey: RequestHandler = (req, _res, next) => {
  const provided = req.header("x-api-key");
  if (!provided || !safeEqual(provided, env.apiKey)) {
    throw new AppError("Missing or invalid X-API-Key", 401);
  }
  next();
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
