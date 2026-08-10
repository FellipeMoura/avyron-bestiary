import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { merchantOffersController } from "./MerchantOffersController";
import {
  BatchUpsertMerchantOffersBodySchema,
  BatchUpsertResponseSchema,
  ListMerchantOffersQuerySchema,
  MerchantOfferSchema,
  UpsertMerchantOfferBodySchema,
  UpsertResponseSchema,
} from "./MerchantOffersTypes";

export const merchantOffersRouter = Router();
const TAG = "merchant-offers";

registry.registerPath({
  method: "get",
  path: "/merchant-offers",
  tags: [TAG],
  summary: "List merchant offers (filter by npc and/or item)",
  description:
    "What each merchant carries. price null means the merchant charges item_stats.value.",
  request: { query: ListMerchantOffersQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(MerchantOfferSchema) } },
      description: "OK",
    },
  },
});
merchantOffersRouter.get(
  "/",
  validateQuery(ListMerchantOffersQuerySchema),
  merchantOffersController.list,
);

registry.registerPath({
  method: "post",
  path: "/merchant-offers/batch",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Batch upsert merchant offers",
  description: "Natural key: (npcCode + itemCode). Re-POST to change price or sortOrder.",
  request: {
    body: {
      content: { "application/json": { schema: BatchUpsertMerchantOffersBodySchema } },
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
merchantOffersRouter.post(
  "/batch",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(BatchUpsertMerchantOffersBodySchema),
  merchantOffersController.batchUpsert,
);

registry.registerPath({
  method: "post",
  path: "/merchant-offers",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Upsert one merchant offer (natural key: npc + item)",
  request: {
    body: {
      content: { "application/json": { schema: UpsertMerchantOfferBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: UpsertResponseSchema } },
      description: "Upserted",
    },
  },
});
merchantOffersRouter.post(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpsertMerchantOfferBodySchema),
  merchantOffersController.upsert,
);
