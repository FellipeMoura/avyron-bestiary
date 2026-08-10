import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { npcsController } from "./NpcsController";
import {
  BatchCreateNpcsBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateNpcBodySchema,
  CreatedResponseSchema,
  ListNpcsQuerySchema,
  NpcSchema,
  UpdateNpcBodySchema,
  UpdatedResponseSchema,
} from "./NpcsTypes";

export const npcsRouter = registerCrudRoutes({
  basePath: "/npcs",
  tag: "npcs",
  controllers: npcsController,
  schemas: {
    listQuery: ListNpcsQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateNpcBodySchema,
    updateBody: UpdateNpcBodySchema,
    batchCreateBody: BatchCreateNpcsBodySchema,
    resource: NpcSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
  },
});
