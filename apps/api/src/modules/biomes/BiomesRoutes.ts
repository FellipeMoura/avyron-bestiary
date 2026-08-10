import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { biomesController } from "./BiomesController";
import {
  BatchCreateBiomesBodySchema,
  BatchCreatedResponseSchema,
  BiomeSchema,
  CodeParamsSchema,
  CreateBiomeBodySchema,
  CreatedResponseSchema,
  DeleteBiomeBodySchema,
  ListBiomesQuerySchema,
  UpdateBiomeBodySchema,
  UpdatedResponseSchema,
} from "./BiomesTypes";

export const biomesRouter = registerCrudRoutes({
  basePath: "/biomes",
  tag: "biomes",
  controllers: biomesController,
  schemas: {
    listQuery: ListBiomesQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateBiomeBodySchema,
    updateBody: UpdateBiomeBodySchema,
    batchCreateBody: BatchCreateBiomesBodySchema,
    resource: BiomeSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
    deleteBody: DeleteBiomeBodySchema,
  },
});
