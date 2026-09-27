import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { arenaStagesController } from "./ArenaStagesController";
import {
  ArenaStageSchema,
  BatchUpsertArenaStagesBodySchema,
  BatchUpsertResponseSchema,
  ListArenaStagesQuerySchema,
  UpsertArenaStageBodySchema,
  UpsertResponseSchema,
} from "./ArenaStagesTypes";

export const arenaStagesRouter = Router();
const TAG = "arena-stages";

registry.registerPath({
  method: "get",
  path: "/arena-stages",
  tags: [TAG],
  summary: "List arena stages (filter by duelist npc)",
  description:
    "The ladder of each arena: stage N is difficulty N, one opponent per stage. " +
    "The last stage must match the npc_duelists duel — the export aborts otherwise.",
  request: { query: ListArenaStagesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(ArenaStageSchema) } },
      description: "OK",
    },
  },
});
arenaStagesRouter.get("/", validateQuery(ListArenaStagesQuerySchema), arenaStagesController.list);

registry.registerPath({
  method: "post",
  path: "/arena-stages/batch",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Batch upsert arena stages",
  description: "Natural key: (npcCode + stage). Re-POST to change opponent, level or reward.",
  request: {
    body: {
      content: { "application/json": { schema: BatchUpsertArenaStagesBodySchema } },
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
arenaStagesRouter.post(
  "/batch",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(BatchUpsertArenaStagesBodySchema),
  arenaStagesController.batchUpsert,
);

registry.registerPath({
  method: "post",
  path: "/arena-stages",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Upsert one arena stage (natural key: npc + stage)",
  request: {
    body: {
      content: { "application/json": { schema: UpsertArenaStageBodySchema } },
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
arenaStagesRouter.post(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpsertArenaStageBodySchema),
  arenaStagesController.upsert,
);
