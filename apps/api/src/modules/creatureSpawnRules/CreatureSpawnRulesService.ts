import { schema } from "@bestiary/db";
import { createChildUpsertService } from "../../shared/services/childUpsertFactory";
import {
  CREATURE_SPAWN_RULE_FIELDS,
  CREATURE_SPAWN_RULE_PAYLOAD,
} from "./CreatureSpawnRulesTypes";

export const creatureSpawnRulesService = createChildUpsertService({
  table: schema.creatureSpawnRules,
  parentTable: schema.creatures,
  parentIdColumn: schema.creatureSpawnRules.creatureId,
  parentIdKey: "creatureId",
  parentCodeField: "creatureCode",
  entityName: "creature_spawn_rules",
  humanName: "Creature spawn rule",
  allowedFields: CREATURE_SPAWN_RULE_FIELDS,
  payloadKeys: CREATURE_SPAWN_RULE_PAYLOAD,
});
