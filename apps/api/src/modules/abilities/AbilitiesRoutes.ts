import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { abilitiesController } from "./AbilitiesController";
import {
  AbilitySchema,
  BatchCreateAbilitiesBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateAbilityBodySchema,
  CreatedResponseSchema,
  ListAbilitiesQuerySchema,
  UpdateAbilityBodySchema,
  UpdatedResponseSchema,
} from "./AbilitiesTypes";

export const abilitiesRouter = registerCrudRoutes({
  basePath: "/abilities",
  tag: "abilities",
  controllers: abilitiesController,
  schemas: {
    listQuery: ListAbilitiesQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateAbilityBodySchema,
    updateBody: UpdateAbilityBodySchema,
    batchCreateBody: BatchCreateAbilitiesBodySchema,
    resource: AbilitySchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
  },
});
