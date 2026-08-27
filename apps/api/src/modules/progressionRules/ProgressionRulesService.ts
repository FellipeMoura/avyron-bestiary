import { schema } from "@bestiary/db";
import { createSingletonService } from "../../shared/services/singletonFactory";
import { PROGRESSION_RULE_PAYLOAD } from "./ProgressionRulesTypes";

export const progressionRulesService = createSingletonService({
  table: schema.progressionRules,
  idColumn: schema.progressionRules.id,
  entityName: "progression_rules",
  humanName: "Progression rules",
  payloadKeys: PROGRESSION_RULE_PAYLOAD,
});
