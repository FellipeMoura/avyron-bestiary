import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { registry } from "../../shared/openapi/registry";
import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { creaturesController } from "./CreaturesController";
import {
  BatchCreateCreaturesBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateCreatureBodySchema,
  CreatedResponseSchema,
  CreatureSchema,
  ListCreaturesQuerySchema,
  SyncModelsResponseSchema,
  UpdateCreatureBodySchema,
  UpdatedResponseSchema,
} from "./CreaturesTypes";

const router = registerCrudRoutes({
  basePath: "/creatures",
  tag: "creatures",
  controllers: creaturesController,
  schemas: {
    listQuery: ListCreaturesQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateCreatureBodySchema,
    updateBody: UpdateCreatureBodySchema,
    batchCreateBody: BatchCreateCreaturesBodySchema,
    resource: CreatureSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
  },
});

/**
 * Not part of the standard CRUD set: scans `apps/web/public/models` and
 * reconciles `modelUrl` against what's actually on disk. Triggered by the
 * "sincronizar modelos" button in the web app — see CreaturesController.
 */
registry.registerPath({
  method: "post",
  path: "/creatures/sync-models",
  tags: ["creatures"],
  security: [{ ApiKey: [] }],
  summary: "Sync creature modelUrl against apps/web/public/models",
  responses: {
    200: {
      content: { "application/json": { schema: SyncModelsResponseSchema } },
      description: "Sync result",
    },
  },
});
router.post("/sync-models", writeLimiter, requireApiKey, creaturesController.syncModels);

export const creaturesRouter = router;
