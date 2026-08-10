import { Router } from "express";
import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { z } from "../openapi/zod";
import { requireApiKey } from "../middleware/apiKey";
import { writeLimiter } from "../middleware/rateLimit";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { registry } from "../openapi/registry";
import { rejectForbiddenTerms } from "./terminology";

interface ChildUpsertControllers {
  list: RequestHandler;
  getByParentCode: RequestHandler;
  upsert: RequestHandler;
  batchUpsert: RequestHandler;
}

interface ChildUpsertSchemas {
  listQuery: ZodTypeAny;
  codeParams: ZodTypeAny;
  upsertBody: ZodTypeAny;
  batchUpsertBody: ZodTypeAny;
  resource: ZodTypeAny;
  upsertedResponse: ZodTypeAny;
  batchUpsertedResponse: ZodTypeAny;
}

interface ChildUpsertRoutesOptions {
  /** Base path relative to /api/v1, e.g. "/creature-stats". */
  basePath: string;
  tag: string;
  /** Shown in the OpenAPI summaries: "creature", "ability". */
  parentNoun: string;
  schemas: ChildUpsertSchemas;
  controllers: ChildUpsertControllers;
}

/**
 * Route wiring for the 1:1-child-of-a-coded-parent resources. Four endpoints:
 * list, get-by-parent-code, upsert, batch upsert. No PATCH and no DELETE —
 * re-POSTing is the update, matching the junction convention already used by
 * `drops` and `map-biomes`.
 */
export function registerChildUpsertRoutes(opts: ChildUpsertRoutesOptions): Router {
  const { basePath, tag, parentNoun, schemas, controllers } = opts;
  const router = Router();

  registry.registerPath({
    method: "get",
    path: basePath,
    tags: [tag],
    summary: `List ${tag}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: { query: schemas.listQuery as any },
    responses: {
      200: { content: { "application/json": { schema: z.array(schemas.resource) } }, description: "OK" },
    },
  });
  router.get("/", validateQuery(schemas.listQuery), controllers.list);

  // /batch before /:code so Express matches it as a literal segment.
  registry.registerPath({
    method: "post",
    path: `${basePath}/batch`,
    tags: [tag],
    security: [{ ApiKey: [] }],
    summary: `Batch upsert ${tag}`,
    request: {
      body: { content: { "application/json": { schema: schemas.batchUpsertBody } }, required: true },
    },
    responses: {
      201: { content: { "application/json": { schema: schemas.batchUpsertedResponse } }, description: "Upserted" },
      422: { description: "Validation failed or unknown code" },
    },
  });
  router.post(
    "/batch",
    writeLimiter,
    requireApiKey,
    rejectForbiddenTerms,
    validateBody(schemas.batchUpsertBody),
    controllers.batchUpsert,
  );

  registry.registerPath({
    method: "get",
    path: `${basePath}/{code}`,
    tags: [tag],
    summary: `Get by ${parentNoun} code`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: { params: schemas.codeParams as any },
    responses: {
      200: { content: { "application/json": { schema: schemas.resource } }, description: "The row" },
      404: { description: "Not found" },
    },
  });
  router.get("/:code", validateParams(schemas.codeParams), controllers.getByParentCode);

  registry.registerPath({
    method: "post",
    path: basePath,
    tags: [tag],
    security: [{ ApiKey: [] }],
    summary: `Upsert ${tag} for one ${parentNoun}`,
    request: {
      body: { content: { "application/json": { schema: schemas.upsertBody } }, required: true },
    },
    responses: {
      201: { content: { "application/json": { schema: schemas.upsertedResponse } }, description: "Upserted" },
      422: { description: "Validation failed or unknown code" },
    },
  });
  router.post(
    "/",
    writeLimiter,
    requireApiKey,
    rejectForbiddenTerms,
    validateBody(schemas.upsertBody),
    controllers.upsert,
  );

  return router;
}
