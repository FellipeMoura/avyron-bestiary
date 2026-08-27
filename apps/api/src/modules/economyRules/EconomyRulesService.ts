import { schema } from "@bestiary/db";
import { createSingletonService } from "../../shared/services/singletonFactory";
import { ECONOMY_RULE_PAYLOAD } from "./EconomyRulesTypes";

export const economyRulesService = createSingletonService({
  table: schema.economyRules,
  idColumn: schema.economyRules.id,
  entityName: "economy_rules",
  humanName: "Economy rules",
  payloadKeys: ECONOMY_RULE_PAYLOAD,
});
