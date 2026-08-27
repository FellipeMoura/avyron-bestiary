import { registerSingletonRoutes } from "../../shared/services/singletonRoutes";
import { economyRulesController } from "./EconomyRulesController";
import {
  EconomyRuleSchema,
  UpdateEconomyRulesBodySchema,
  UpdatedResponseSchema,
} from "./EconomyRulesTypes";

export const economyRulesRouter = registerSingletonRoutes({
  basePath: "/economy-rules",
  tag: "economy-rules",
  subject: "economy",
  description:
    "Currency name, starting purse and the merchant's buy/sell spread. The game reads these " +
    "from the exported bundle — no economy constant lives in Godot code.",
  schemas: {
    resource: EconomyRuleSchema,
    updateBody: UpdateEconomyRulesBodySchema,
    updatedResponse: UpdatedResponseSchema,
  },
  controllers: economyRulesController,
});
