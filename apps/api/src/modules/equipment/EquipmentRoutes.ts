import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { equipmentController } from "./EquipmentController";
import {
  BatchCreateEquipmentBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateEquipmentBodySchema,
  CreatedResponseSchema,
  EquipmentSchema,
  ListEquipmentQuerySchema,
  UpdateEquipmentBodySchema,
  UpdatedResponseSchema,
} from "./EquipmentTypes";

/**
 * No DELETE, same as `/relics`: a model authored wrong is fixed by PATCH.
 * Deleting one would orphan a crafted item in some player's save, and this
 * catalog has no way to know that happened.
 */
export const equipmentRouter = registerCrudRoutes({
  basePath: "/equipment",
  tag: "equipment",
  controllers: equipmentController,
  schemas: {
    listQuery: ListEquipmentQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateEquipmentBodySchema,
    updateBody: UpdateEquipmentBodySchema,
    batchCreateBody: BatchCreateEquipmentBodySchema,
    resource: EquipmentSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
  },
});
