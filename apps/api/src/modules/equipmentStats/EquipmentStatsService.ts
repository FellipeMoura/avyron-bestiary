import { schema } from "@bestiary/db";
import { createChildUpsertService } from "../../shared/services/childUpsertFactory";
import { EQUIPMENT_STAT_FIELDS, EQUIPMENT_STAT_PAYLOAD } from "./EquipmentStatsTypes";

export const equipmentStatsService = createChildUpsertService({
  table: schema.equipmentStats,
  parentTable: schema.equipment,
  parentIdColumn: schema.equipmentStats.equipmentId,
  parentIdKey: "equipmentId",
  parentCodeField: "equipmentCode",
  entityName: "equipment_stats",
  humanName: "Equipment stats",
  allowedFields: EQUIPMENT_STAT_FIELDS,
  payloadKeys: EQUIPMENT_STAT_PAYLOAD,
});
