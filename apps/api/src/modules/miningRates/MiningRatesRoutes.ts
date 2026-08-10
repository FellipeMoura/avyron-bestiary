import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { miningRatesController } from "./MiningRatesController";
import {
  BatchUpsertMiningRatesBodySchema,
  BatchUpsertResponseSchema,
  ListMiningRatesQuerySchema,
  MiningRateSchema,
  UpsertMiningRateBodySchema,
  UpsertResponseSchema,
} from "./MiningRatesTypes";

export const miningRatesRouter = Router();
const TAG = "mining-rates";

registry.registerPath({
  method: "get",
  path: "/mining-rates",
  tags: [TAG],
  summary: "List mining rates (filter by class, biome and/or item)",
  description:
    "Returns ore weight rows. Use classCode to get all weights for a class, biomeCode for a biome. " +
    "The game multiplies class_weight × biome_weight per ore type and normalises to a probability table.",
  request: { query: ListMiningRatesQuerySchema },
  responses: {
    200: { content: { "application/json": { schema: z.array(MiningRateSchema) } }, description: "OK" },
  },
});
miningRatesRouter.get("/", validateQuery(ListMiningRatesQuerySchema), miningRatesController.list);

registry.registerPath({
  method: "post",
  path: "/mining-rates/batch",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Batch upsert mining rates",
  description:
    "Each item must have exactly one of classCode or biomeCode. Natural key: (classCode + itemCode) or (biomeCode + itemCode).",
  request: {
    body: {
      content: { "application/json": { schema: BatchUpsertMiningRatesBodySchema } },
      required: true,
    },
  },
  responses: {
    201: { content: { "application/json": { schema: BatchUpsertResponseSchema } }, description: "Upserted" },
  },
});
miningRatesRouter.post(
  "/batch",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(BatchUpsertMiningRatesBodySchema),
  miningRatesController.batchUpsert,
);

registry.registerPath({
  method: "post",
  path: "/mining-rates",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Upsert one mining rate (natural key: class|biome + item)",
  description:
    "Provide exactly one of classCode or biomeCode. Re-POST with the same key to update the weight.",
  request: {
    body: {
      content: { "application/json": { schema: UpsertMiningRateBodySchema } },
      required: true,
    },
  },
  responses: {
    201: { content: { "application/json": { schema: UpsertResponseSchema } }, description: "Upserted" },
  },
});
miningRatesRouter.post(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpsertMiningRateBodySchema),
  miningRatesController.upsert,
);
