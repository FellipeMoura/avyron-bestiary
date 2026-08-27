import { Router } from "express";
import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { requireApiKey } from "../middleware/apiKey";
import { writeLimiter } from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import { registry } from "../openapi/registry";
import { rejectForbiddenTerms } from "./terminology";

export interface SingletonRoutesOptions {
  /** Base path relative to /api/v1, e.g. "/combat-rules". No trailing slash. */
  basePath: string;
  /** OpenAPI tag grouping for the endpoints. */
  tag: string;
  /**
   * Noun that completes the two summaries: "Get the <subject> constants
   * (singleton)" and "Tune one or more <subject> constants". So "combat",
   * "economy", "level-up", "relic system".
   */
  subject: string;
  /**
   * Prose shown under GET. This is the only text an agent reads before
   * touching the numbers, so it carries the formulas or the domain rule —
   * it is not a restatement of the summary.
   */
  description?: string;
  /** True when the service declares `orderedPairs`, which widens the 422 text. */
  validatesPairs?: boolean;
  schemas: {
    /** Shape of the row returned by GET. */
    resource: ZodTypeAny;
    /** PATCH body, already merged with `changeMetadataSchema`. */
    updateBody: ZodTypeAny;
    /** PATCH response, `{ version }`. */
    updatedResponse: ZodTypeAny;
  };
  controllers: {
    get: RequestHandler;
    update: RequestHandler;
  };
}

/**
 * Wires the two endpoints a singleton rules resource has: `GET` and `PATCH`.
 *
 * Counterpart of `crudRoutes` for tables with no code and no list. Keeping the
 * middleware chain in one place matters more than the lines saved: a write
 * that skipped `rejectForbiddenTerms` or `writeLimiter` would be invisible in
 * review, since every one of these files looks the same from a distance.
 */
export function registerSingletonRoutes(opts: SingletonRoutesOptions): Router {
  const { basePath, tag, subject, description, validatesPairs, schemas, controllers } = opts;
  const router = Router();

  registry.registerPath({
    method: "get",
    path: basePath,
    tags: [tag],
    summary: `Get the ${subject} constants (singleton)`,
    ...(description ? { description } : {}),
    responses: {
      200: { content: { "application/json": { schema: schemas.resource } }, description: "OK" },
    },
  });
  router.get("/", controllers.get);

  registry.registerPath({
    method: "patch",
    path: basePath,
    tags: [tag],
    security: [{ ApiKey: [] }],
    summary: `Tune one or more ${subject} constants`,
    request: {
      body: {
        content: { "application/json": { schema: schemas.updateBody } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: schemas.updatedResponse } },
        description: "Updated",
      },
      422: {
        description: validatesPairs ? "Validation failed or inconsistent pair" : "Validation failed",
      },
    },
  });
  router.patch(
    "/",
    writeLimiter,
    requireApiKey,
    rejectForbiddenTerms,
    validateBody(schemas.updateBody),
    controllers.update,
  );

  return router;
}
