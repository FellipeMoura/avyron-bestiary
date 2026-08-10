import { schema } from "@bestiary/db";
import { createChildUpsertService } from "../../shared/services/childUpsertFactory";
import { ABILITY_STAT_FIELDS, ABILITY_STAT_PAYLOAD } from "./AbilityStatsTypes";

export const abilityStatsService = createChildUpsertService({
  table: schema.abilityStats,
  parentTable: schema.abilities,
  parentIdColumn: schema.abilityStats.abilityId,
  parentIdKey: "abilityId",
  parentCodeField: "abilityCode",
  entityName: "ability_stats",
  humanName: "Ability stats",
  allowedFields: ABILITY_STAT_FIELDS,
  payloadKeys: ABILITY_STAT_PAYLOAD,
});
