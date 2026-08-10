import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { mapBiomesController } from "./MapBiomesController";
import {
  BatchUpsertMapBiomesBodySchema,
  BatchUpsertResponseSchema,
  ListMapBiomesQuerySchema,
  MapBiomeSchema,
  UpsertMapBiomeBodySchema,
  UpsertResponseSchema,
} from "./MapBiomesTypes";

export const mapBiomesRouter = Router();
const TAG = "map-biomes";

registry.registerPath({
  method: "get",
  path: "/map-biomes",
  tags: [TAG],
  summary: "List map↔biome links (filter by map or biome)",
  request: { query: ListMapBiomesQuerySchema },
  responses: {
    200: { content: { "application/json": { schema: z.array(MapBiomeSchema) } }, description: "OK" },
  },
});
mapBiomesRouter.get("/", validateQuery(ListMapBiomesQuerySchema), mapBiomesController.list);

registry.registerPath({
  method: "post",
  path: "/map-biomes/batch",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Batch upsert map↔biome links",
  request: {
    body: { content: { "application/json": { schema: BatchUpsertMapBiomesBodySchema } }, required: true },
  },
  responses: {
    201: { content: { "application/json": { schema: BatchUpsertResponseSchema } }, description: "Upserted" },
  },
});
mapBiomesRouter.post(
  "/batch",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(BatchUpsertMapBiomesBodySchema),
  mapBiomesController.batchUpsert,
);

registry.registerPath({
  method: "post",
  path: "/map-biomes",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Upsert one map↔biome link",
  request: {
    body: { content: { "application/json": { schema: UpsertMapBiomeBodySchema } }, required: true },
  },
  responses: {
    201: { content: { "application/json": { schema: UpsertResponseSchema } }, description: "Upserted" },
  },
});
mapBiomesRouter.post(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpsertMapBiomeBodySchema),
  mapBiomesController.upsert,
);
