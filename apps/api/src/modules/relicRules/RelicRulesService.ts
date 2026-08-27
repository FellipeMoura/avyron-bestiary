import { schema } from "@bestiary/db";
import { createSingletonService } from "../../shared/services/singletonFactory";
import { RELIC_RULE_PAYLOAD } from "./RelicRulesTypes";

export const relicRulesService = createSingletonService({
  table: schema.relicRules,
  idColumn: schema.relicRules.id,
  entityName: "relic_rules",
  humanName: "Relic rules",
  payloadKeys: RELIC_RULE_PAYLOAD,
  orderedPairs: [["captureFloorPct", "captureCeilPct"]],
});
