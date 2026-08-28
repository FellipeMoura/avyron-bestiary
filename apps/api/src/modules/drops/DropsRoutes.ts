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
  DeleteDropBodySchema,
  DeletedResponseSchema,
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

registry.registerPath({
  method: "delete",
  path: "/drops",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Remove one drop (natural key: creature + item + condition)",
  description:
    "Omitting `condition` addresses the row whose condition is null, matching the upsert's "
    + "conflict target — it never removes every condition for the pair. Use this instead of "
    + "re-POSTing with `chance: 0`: a row with chance 0 still asserts the pairing, and the "
    + "export reads the row's existence.",
  request: {
    body: { content: { "application/json": { schema: DeleteDropBodySchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DeletedResponseSchema } },
      description: "Deleted",
    },
    404: { description: "Creature does not drop this item under this condition" },
  },
});
dropsRouter.delete(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(DeleteDropBodySchema),
  dropsController.delete,
);
