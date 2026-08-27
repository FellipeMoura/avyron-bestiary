import { registerSingletonRoutes } from "../../shared/services/singletonRoutes";
import { combatRulesController } from "./CombatRulesController";
import {
  CombatRuleSchema,
  UpdateCombatRulesBodySchema,
  UpdatedResponseSchema,
} from "./CombatRulesTypes";

export const combatRulesRouter = registerSingletonRoutes({
  basePath: "/combat-rules",
  tag: "combat-rules",
  subject: "combat",
  validatesPairs: true,
  schemas: {
    resource: CombatRuleSchema,
    updateBody: UpdateCombatRulesBodySchema,
    updatedResponse: UpdatedResponseSchema,
  },
  controllers: combatRulesController,
});
