import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { elementalAdvantagesController } from "./ElementalAdvantagesController";
import {
  BatchUpsertElementalAdvantagesBodySchema,
  BatchUpsertResponseSchema,
  ElementalAdvantageSchema,
  ListElementalAdvantagesQuerySchema,
  UpsertElementalAdvantageBodySchema,
  UpsertResponseSchema,
} from "./ElementalAdvantagesTypes";

export const elementalAdvantagesRouter = Router();
const TAG = "elemental-advantages";

registry.registerPath({
  method: "get",
  path: "/elemental-advantages",
  tags: [TAG],
  summary: "List elemental advantages (attacker vs defender + multiplier)",
  request: { query: ListElementalAdvantagesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(ElementalAdvantageSchema) } },
      description: "OK",
    },
  },
});
elementalAdvantagesRouter.get(
  "/",
  validateQuery(ListElementalAdvantagesQuerySchema),
  elementalAdvantagesController.list,
);

registry.registerPath({
  method: "post",
  path: "/elemental-advantages/batch",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Batch upsert elemental advantages",
  request: {
    body: {
      content: { "application/json": { schema: BatchUpsertElementalAdvantagesBodySchema } },
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
elementalAdvantagesRouter.post(
  "/batch",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(BatchUpsertElementalAdvantagesBodySchema),
  elementalAdvantagesController.batchUpsert,
);

registry.registerPath({
  method: "post",
  path: "/elemental-advantages",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Upsert one elemental advantage",
  request: {
    body: {
      content: { "application/json": { schema: UpsertElementalAdvantageBodySchema } },
      required: true,
    },
  },
  responses: {
    201: { content: { "application/json": { schema: UpsertResponseSchema } }, description: "Upserted" },
  },
});
elementalAdvantagesRouter.post(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpsertElementalAdvantageBodySchema),
  elementalAdvantagesController.upsert,
);
