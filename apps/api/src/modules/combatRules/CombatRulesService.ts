import { schema } from "@bestiary/db";
import { createSingletonService } from "../../shared/services/singletonFactory";
import { COMBAT_RULE_PAYLOAD } from "./CombatRulesTypes";

export const combatRulesService = createSingletonService({
  table: schema.combatRules,
  idColumn: schema.combatRules.id,
  entityName: "combat_rules",
  humanName: "Combat rules",
  payloadKeys: COMBAT_RULE_PAYLOAD,
  orderedPairs: [
    ["damageVarianceMin", "damageVarianceMax"],
    ["captureMinChance", "captureMaxChance"],
    ["levelMin", "levelMax"],
  ],
});
