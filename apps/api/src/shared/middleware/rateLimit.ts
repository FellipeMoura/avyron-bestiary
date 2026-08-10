import rateLimit from "express-rate-limit";
import { env, isProd } from "../../env";

/**
 * Loose limit applied on top of write routes. The goal is preventing a buggy
 * agent from saturating CPU/DB and hurting the neighbours on the shared VPS,
 * not protecting data (see CLAUDE.md's threat model). Read routes stay
 * unlimited — Cloudflare in front absorbs abusive read spikes.
 *
 * Skipped in dev to keep testing painless.
 */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !isProd,
  message: {
    message: "Rate limit exceeded — max 300 write requests per minute per IP",
  },
});

// Re-export env so callers can check nodeEnv without a separate import.
export { env };
