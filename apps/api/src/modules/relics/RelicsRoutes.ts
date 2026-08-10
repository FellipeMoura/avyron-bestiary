import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { relicsController } from "./RelicsController";
import {
  BatchCreateRelicsBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateRelicBodySchema,
  CreatedResponseSchema,
  ListRelicsQuerySchema,
  RelicSchema,
  UpdateRelicBodySchema,
  UpdatedResponseSchema,
} from "./RelicsTypes";

/**
 * No `delete` controller — matches the handoff's "sem DELETE em lugar
 * nenhum" for this module. A relic model that turns out wrong gets fixed
 * via PATCH, same as everything else in the catalog.
 */
export const relicsRouter = registerCrudRoutes({
  basePath: "/relics",
  tag: "relics",
  controllers: relicsController,
  schemas: {
    listQuery: ListRelicsQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateRelicBodySchema,
    updateBody: UpdateRelicBodySchema,
    batchCreateBody: BatchCreateRelicsBodySchema,
    resource: RelicSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
  },
});
