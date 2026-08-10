import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { creatureClassesController } from "./CreatureClassesController";
import {
  BatchCreateCreatureClassesBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateCreatureClassBodySchema,
  CreatedResponseSchema,
  CreatureClassSchema,
  DeleteCreatureClassBodySchema,
  ListCreatureClassesQuerySchema,
  UpdateCreatureClassBodySchema,
  UpdatedResponseSchema,
} from "./CreatureClassesTypes";

export const creatureClassesRouter = registerCrudRoutes({
  basePath: "/creature-classes",
  tag: "creature-classes",
  controllers: creatureClassesController,
  schemas: {
    listQuery: ListCreatureClassesQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateCreatureClassBodySchema,
    updateBody: UpdateCreatureClassBodySchema,
    batchCreateBody: BatchCreateCreatureClassesBodySchema,
    resource: CreatureClassSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
    deleteBody: DeleteCreatureClassBodySchema,
  },
});
