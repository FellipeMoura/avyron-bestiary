import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { mapConnectionsController } from "./MapConnectionsController";
import {
  BatchUpsertMapConnectionsBodySchema,
  BatchUpsertResponseSchema,
  ListMapConnectionsQuerySchema,
  MapConnectionSchema,
  UpsertMapConnectionBodySchema,
  UpsertResponseSchema,
} from "./MapConnectionsTypes";

export const mapConnectionsRouter = Router();
const TAG = "map-connections";

registry.registerPath({
  method: "get",
  path: "/map-connections",
  tags: [TAG],
  summary: "List map→map crossings (filter by origin, destination or glyph)",
  request: { query: ListMapConnectionsQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(MapConnectionSchema) } },
      description: "OK",
    },
  },
});
mapConnectionsRouter.get(
  "/",
  validateQuery(ListMapConnectionsQuerySchema),
  mapConnectionsController.list,
);

registry.registerPath({
  method: "post",
  path: "/map-connections/batch",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Batch upsert map crossings",
  request: {
    body: {
      content: { "application/json": { schema: BatchUpsertMapConnectionsBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: BatchUpsertResponseSchema } },
      description: "Upserted",
    },
  },
});
mapConnectionsRouter.post(
  "/batch",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(BatchUpsertMapConnectionsBodySchema),
  mapConnectionsController.batchUpsert,
);

registry.registerPath({
  method: "post",
  path: "/map-connections",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Upsert one map crossing",
  request: {
    body: {
      content: { "application/json": { schema: UpsertMapConnectionBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: UpsertResponseSchema } },
      description: "Upserted",
    },
    422: { description: "Unknown code, or a map connected to itself" },
  },
});
mapConnectionsRouter.post(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpsertMapConnectionBodySchema),
  mapConnectionsController.upsert,
);
