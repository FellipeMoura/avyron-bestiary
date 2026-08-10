import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { gameMapsController } from "./GameMapsController";
import {
  BatchCreateGameMapsBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateGameMapBodySchema,
  CreatedResponseSchema,
  DeleteGameMapBodySchema,
  GameMapSchema,
  ListGameMapsQuerySchema,
  UpdateGameMapBodySchema,
  UpdatedResponseSchema,
} from "./GameMapsTypes";

export const gameMapsRouter = registerCrudRoutes({
  basePath: "/maps",
  tag: "maps",
  controllers: gameMapsController,
  schemas: {
    listQuery: ListGameMapsQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateGameMapBodySchema,
    updateBody: UpdateGameMapBodySchema,
    batchCreateBody: BatchCreateGameMapsBodySchema,
    resource: GameMapSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
    deleteBody: DeleteGameMapBodySchema,
  },
});
