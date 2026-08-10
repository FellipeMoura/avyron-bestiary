import { schema } from "@bestiary/db";
import { createChildUpsertService } from "../../shared/services/childUpsertFactory";
import { CREATURE_STAT_FIELDS, CREATURE_STAT_PAYLOAD } from "./CreatureStatsTypes";

export const creatureStatsService = createChildUpsertService({
  table: schema.creatureStats,
  parentTable: schema.creatures,
  parentIdColumn: schema.creatureStats.creatureId,
  parentIdKey: "creatureId",
  parentCodeField: "creatureCode",
  entityName: "creature_stats",
  humanName: "Creature stats",
  allowedFields: CREATURE_STAT_FIELDS,
  payloadKeys: CREATURE_STAT_PAYLOAD,
});
