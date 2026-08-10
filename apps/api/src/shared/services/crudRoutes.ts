import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "../openapi/zod";
import type { ZodTypeAny } from "zod";
import { requireApiKey } from "../middleware/apiKey";
import { writeLimiter } from "../middleware/rateLimit";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import { registry } from "../openapi/registry";
import { changeMetadataSchema } from "./query";
import { rejectForbiddenTerms } from "./terminology";

/**
 * Turn a plural tag into its singular form for `POST /tag → "Create <singular>"`
 * summaries. Handles `-ies → -y` (abilities → ability) and `-sses/-shes/-ches/
 * -xes/-zes → strip -es` (creature-classes → creature-class), then falls back
 * to trimming a trailing `s`. Naive `.replace(/s$/, "")` produced "abilitie"
 * and "creature-classe" — the LLM readers copy those verbatim.
 */
function singularize(tag: string): string {
  if (tag.endsWith("ies")) return tag.slice(0, -3) + "y";
  if (/(s|x|z|ch|sh)es$/.test(tag)) return tag.slice(0, -2);
  if (tag.endsWith("s")) return tag.slice(0, -1);
  return tag;
}

interface CrudControllers {
  list: RequestHandler;
  getByCode: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  batchCreate: RequestHandler;
  /**
   * Optional. If provided, DELETE /:code is wired. Modules without a
   * safe deletion path (creatures with cascading FKs, etc.) simply
   * leave this off.
   */
  delete?: RequestHandler;
}

interface CrudSchemas {
  listQuery: ZodTypeAny;
  codeParams: ZodTypeAny;
  createBody: ZodTypeAny;
  updateBody: ZodTypeAny;
  batchCreateBody: ZodTypeAny;
  /** Shape of a single row in list/getByCode responses. */
  resource: ZodTypeAny;
  createdResponse: ZodTypeAny;
  updatedResponse: ZodTypeAny;
  batchCreatedResponse: ZodTypeAny;
  /**
   * Optional body/response schemas for DELETE. Default body is
   * `changeMetadataSchema` (reason + impact); default response reuses
   * `updatedResponse` since the shape is `{code, version}`.
   */
  deleteBody?: ZodTypeAny;
  deletedResponse?: ZodTypeAny;
}

interface CrudRoutesOptions {
  /** Base path relative to /api/v1, e.g. "/biomes". No trailing slash. */
  basePath: string;
  /** OpenAPI tag grouping for the endpoints. */
  tag: string;
  schemas: CrudSchemas;
  controllers: CrudControllers;
}

/**
 * Wires up the standard CRUD endpoints (list, batch, getByCode, create,
 * update, delete) with their OpenAPI registrations and middleware chain.
 * Every write gets `requireApiKey` + `rejectForbiddenTerms`. DELETE is
 * only mounted when `controllers.delete` is provided. Modules with extra
 * endpoints or exotic middleware wire those manually AFTER calling this.
 */
export function registerCrudRoutes(opts: CrudRoutesOptions): Router {
  const { basePath, tag, schemas, controllers } = opts;
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

  // /batch registered before /:code so express routes it as literal
  registry.registerPath({
    method: "post",
    path: `${basePath}/batch`,
    tags: [tag],
    security: [{ ApiKey: [] }],
    summary: `Batch create ${tag}`,
    request: {
      body: { content: { "application/json": { schema: schemas.batchCreateBody } }, required: true },
    },
    responses: {
      201: { content: { "application/json": { schema: schemas.batchCreatedResponse } }, description: "Created" },
    },
  });
  router.post(
    "/batch",
    writeLimiter,
    requireApiKey,
    rejectForbiddenTerms,
    validateBody(schemas.batchCreateBody),
    controllers.batchCreate,
  );

  registry.registerPath({
    method: "get",
    path: `${basePath}/{code}`,
    tags: [tag],
    summary: "Get one by code",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: { params: schemas.codeParams as any },
    responses: {
      200: { content: { "application/json": { schema: schemas.resource } }, description: "The row" },
      404: { description: "Not found" },
    },
  });
  router.get("/:code", validateParams(schemas.codeParams), controllers.getByCode);

  registry.registerPath({
    method: "post",
    path: basePath,
    tags: [tag],
    security: [{ ApiKey: [] }],
    summary: `Create ${singularize(tag)}`,
    request: {
      body: { content: { "application/json": { schema: schemas.createBody } }, required: true },
    },
    responses: {
      201: { content: { "application/json": { schema: schemas.createdResponse } }, description: "Created" },
      409: { description: "Code already exists" },
      422: { description: "Validation failed or deprecated term" },
    },
  });
  router.post(
    "/",
    writeLimiter,
    requireApiKey,
    rejectForbiddenTerms,
    validateBody(schemas.createBody),
    controllers.create,
  );

  registry.registerPath({
    method: "patch",
    path: `${basePath}/{code}`,
    tags: [tag],
    security: [{ ApiKey: [] }],
    summary: `Update ${singularize(tag)}`,
    request: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: schemas.codeParams as any,
      body: { content: { "application/json": { schema: schemas.updateBody } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: schemas.updatedResponse } }, description: "Updated" },
      404: { description: "Not found" },
      422: { description: "Validation failed or deprecated term" },
    },
  });
  router.patch(
    "/:code",
    writeLimiter,
    requireApiKey,
    rejectForbiddenTerms,
    validateParams(schemas.codeParams),
    validateBody(schemas.updateBody),
    controllers.update,
  );

  if (controllers.delete) {
    const deleteBody = schemas.deleteBody ?? changeMetadataSchema;
    const deletedResponse = schemas.deletedResponse ?? schemas.updatedResponse;
    registry.registerPath({
      method: "delete",
      path: `${basePath}/{code}`,
      tags: [tag],
      security: [{ ApiKey: [] }],
      summary: `Delete ${singularize(tag)}`,
      request: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params: schemas.codeParams as any,
        body: { content: { "application/json": { schema: deleteBody } }, required: true },
      },
      responses: {
        200: { content: { "application/json": { schema: deletedResponse } }, description: "Deleted" },
        404: { description: "Not found" },
        409: { description: "Still referenced by other records" },
        422: { description: "Validation failed" },
      },
    });
    router.delete(
      "/:code",
      writeLimiter,
      requireApiKey,
      validateParams(schemas.codeParams),
      validateBody(deleteBody),
      controllers.delete,
    );
  }

  return router;
}
