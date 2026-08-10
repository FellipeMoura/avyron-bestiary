import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { missionsController } from "./MissionsController";
import {
  BatchCreateMissionsBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateMissionBodySchema,
  CreatedResponseSchema,
  ListMissionsQuerySchema,
  MissionSchema,
  UpdateMissionBodySchema,
  UpdatedResponseSchema,
} from "./MissionsTypes";

export const missionsRouter = registerCrudRoutes({
  basePath: "/missions",
  tag: "missions",
  controllers: missionsController,
  schemas: {
    listQuery: ListMissionsQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateMissionBodySchema,
    updateBody: UpdateMissionBodySchema,
    batchCreateBody: BatchCreateMissionsBodySchema,
    resource: MissionSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
  },
});
