import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { dropsController } from "./DropsController";
import {
  BatchUpsertDropsBodySchema,
  BatchUpsertResponseSchema,
  DropSchema,
  ListDropsQuerySchema,
  UpsertDropBodySchema,
  UpsertResponseSchema,
} from "./DropsTypes";

export const dropsRouter = Router();
const TAG = "drops";

registry.registerPath({
  method: "get",
  path: "/drops",
  tags: [TAG],
  summary: "List drops (filter by creature and/or item)",
  request: { query: ListDropsQuerySchema },
  responses: {
    200: { content: { "application/json": { schema: z.array(DropSchema) } }, description: "OK" },
  },
});
dropsRouter.get("/", validateQuery(ListDropsQuerySchema), dropsController.list);

registry.registerPath({
  method: "post",
  path: "/drops/batch",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Batch upsert drops",
  request: {
    body: { content: { "application/json": { schema: BatchUpsertDropsBodySchema } }, required: true },
  },
  responses: {
    201: { content: { "application/json": { schema: BatchUpsertResponseSchema } }, description: "Upserted" },
  },
});
dropsRouter.post(
  "/batch",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(BatchUpsertDropsBodySchema),
  dropsController.batchUpsert,
);

registry.registerPath({
  method: "post",
  path: "/drops",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Upsert one drop (natural key: creature + item + condition)",
  request: {
    body: { content: { "application/json": { schema: UpsertDropBodySchema } }, required: true },
  },
  responses: {
    201: { content: { "application/json": { schema: UpsertResponseSchema } }, description: "Upserted" },
  },
});
dropsRouter.post(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpsertDropBodySchema),
  dropsController.upsert,
);
