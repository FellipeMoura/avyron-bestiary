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
  UpdateCreatureBodySchema,
  UpdatedResponseSchema,
} from "./CreaturesTypes";

export const creaturesRouter = registerCrudRoutes({
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
