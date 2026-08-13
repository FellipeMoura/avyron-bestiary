import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { creatureAbilitiesController } from "./CreatureAbilitiesController";
import {
  BatchUpsertCreatureAbilitiesBodySchema,
  BatchUpsertResponseSchema,
  CreatureAbilitySchema,
  DeleteCreatureAbilityBodySchema,
  DeletedResponseSchema,
  ListCreatureAbilitiesQuerySchema,
  UpsertCreatureAbilityBodySchema,
  UpsertResponseSchema,
} from "./CreatureAbilitiesTypes";

export const creatureAbilitiesRouter = Router();
const TAG = "creature-abilities";

registry.registerPath({
  method: "get",
  path: "/creature-abilities",
  tags: [TAG],
  summary: "List creature-ability links (filter by creature and/or ability)",
  request: { query: ListCreatureAbilitiesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(CreatureAbilitySchema) } },
      description: "OK",
    },
  },
});
creatureAbilitiesRouter.get(
  "/",
  validateQuery(ListCreatureAbilitiesQuerySchema),
  creatureAbilitiesController.list,
);

registry.registerPath({
  method: "post",
  path: "/creature-abilities/batch",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Batch upsert creature-ability links",
  request: {
    body: {
      content: { "application/json": { schema: BatchUpsertCreatureAbilitiesBodySchema } },
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
creatureAbilitiesRouter.post(
  "/batch",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(BatchUpsertCreatureAbilitiesBodySchema),
  creatureAbilitiesController.batchUpsert,
);

registry.registerPath({
  method: "post",
  path: "/creature-abilities",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Upsert one creature-ability link (natural key: creature + ability)",
  request: {
    body: {
      content: { "application/json": { schema: UpsertCreatureAbilityBodySchema } },
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
creatureAbilitiesRouter.post(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpsertCreatureAbilityBodySchema),
  creatureAbilitiesController.upsert,
);

registry.registerPath({
  method: "delete",
  path: "/creature-abilities",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Remove one creature-ability link (natural key: creature + ability)",
  request: {
    body: {
      content: { "application/json": { schema: DeleteCreatureAbilityBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DeletedResponseSchema } },
      description: "Deleted",
    },
    404: { description: "Creature does not know this ability" },
  },
});
creatureAbilitiesRouter.delete(
  "/",
  writeLimiter,
  requireApiKey,
  validateBody(DeleteCreatureAbilityBodySchema),
  creatureAbilitiesController.delete,
);
