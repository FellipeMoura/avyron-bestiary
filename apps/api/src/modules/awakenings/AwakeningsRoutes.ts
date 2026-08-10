import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { awakeningsController } from "./AwakeningsController";
import {
  AwakeningSchema,
  BatchCreateAwakeningsBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateAwakeningBodySchema,
  CreatedResponseSchema,
  ListAwakeningsQuerySchema,
  UpdateAwakeningBodySchema,
  UpdatedResponseSchema,
} from "./AwakeningsTypes";

export const awakeningsRouter = registerCrudRoutes({
  basePath: "/awakenings",
  tag: "awakenings",
  controllers: awakeningsController,
  schemas: {
    listQuery: ListAwakeningsQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateAwakeningBodySchema,
    updateBody: UpdateAwakeningBodySchema,
    batchCreateBody: BatchCreateAwakeningsBodySchema,
    resource: AwakeningSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
  },
});
