import { registerChildUpsertRoutes } from "../../shared/services/childUpsertRoutes";
import { equipmentStatsController } from "./EquipmentStatsController";
import {
  BatchUpsertEquipmentStatsBodySchema,
  BatchUpsertResponseSchema,
  EquipmentCodeParamsSchema,
  EquipmentStatSchema,
  ListEquipmentStatsQuerySchema,
  UpsertEquipmentStatBodySchema,
  UpsertResponseSchema,
} from "./EquipmentStatsTypes";

export const equipmentStatsRouter = registerChildUpsertRoutes({
  basePath: "/equipment-stats",
  tag: "equipment-stats",
  parentNoun: "equipment",
  schemas: {
    listQuery: ListEquipmentStatsQuerySchema,
    codeParams: EquipmentCodeParamsSchema,
    upsertBody: UpsertEquipmentStatBodySchema,
    batchUpsertBody: BatchUpsertEquipmentStatsBodySchema,
    resource: EquipmentStatSchema,
    upsertedResponse: UpsertResponseSchema,
    batchUpsertedResponse: BatchUpsertResponseSchema,
  },
  controllers: equipmentStatsController,
});
