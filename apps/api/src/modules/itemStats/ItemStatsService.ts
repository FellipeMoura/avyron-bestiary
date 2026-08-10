import { schema } from "@bestiary/db";
import { createChildUpsertService } from "../../shared/services/childUpsertFactory";
import { ITEM_STAT_FIELDS, ITEM_STAT_PAYLOAD } from "./ItemStatsTypes";

export const itemStatsService = createChildUpsertService({
  table: schema.itemStats,
  parentTable: schema.items,
  parentIdColumn: schema.itemStats.itemId,
  parentIdKey: "itemId",
  parentCodeField: "itemCode",
  entityName: "item_stats",
  humanName: "Item stats",
  allowedFields: ITEM_STAT_FIELDS,
  payloadKeys: ITEM_STAT_PAYLOAD,
});
