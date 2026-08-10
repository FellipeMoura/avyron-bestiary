import { schema } from "@bestiary/db";
import { createChildUpsertService } from "../../shared/services/childUpsertFactory";
import { RELIC_STAT_FIELDS, RELIC_STAT_PAYLOAD } from "./RelicStatsTypes";

export const relicStatsService = createChildUpsertService({
  table: schema.relicStats,
  parentTable: schema.relics,
  parentIdColumn: schema.relicStats.relicId,
  parentIdKey: "relicId",
  parentCodeField: "relicCode",
  entityName: "relic_stats",
  humanName: "Relic stats",
  allowedFields: RELIC_STAT_FIELDS,
  payloadKeys: RELIC_STAT_PAYLOAD,
});
