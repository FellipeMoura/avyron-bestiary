import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { elementsController } from "./ElementsController";
import {
  BatchCreateElementsBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateElementBodySchema,
  CreatedResponseSchema,
  DeleteElementBodySchema,
  ElementSchema,
  ListElementsQuerySchema,
  UpdateElementBodySchema,
  UpdatedResponseSchema,
} from "./ElementsTypes";

export const elementsRouter = registerCrudRoutes({
  basePath: "/elements",
  tag: "elements",
  controllers: elementsController,
  schemas: {
    listQuery: ListElementsQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateElementBodySchema,
    updateBody: UpdateElementBodySchema,
    batchCreateBody: BatchCreateElementsBodySchema,
    resource: ElementSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
    deleteBody: DeleteElementBodySchema,
  },
});
