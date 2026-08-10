import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { itemsController } from "./ItemsController";
import {
  BatchCreateItemsBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateItemBodySchema,
  CreatedResponseSchema,
  DeleteItemBodySchema,
  ItemSchema,
  ListItemsQuerySchema,
  UpdateItemBodySchema,
  UpdatedResponseSchema,
} from "./ItemsTypes";

export const itemsRouter = registerCrudRoutes({
  basePath: "/items",
  tag: "items",
  controllers: itemsController,
  schemas: {
    listQuery: ListItemsQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateItemBodySchema,
    updateBody: UpdateItemBodySchema,
    batchCreateBody: BatchCreateItemsBodySchema,
    resource: ItemSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
    deleteBody: DeleteItemBodySchema,
  },
});
