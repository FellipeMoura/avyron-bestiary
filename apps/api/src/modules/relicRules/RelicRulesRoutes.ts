import { registerSingletonRoutes } from "../../shared/services/singletonRoutes";
import { relicRulesController } from "./RelicRulesController";
import {
  RelicRuleSchema,
  UpdateRelicRulesBodySchema,
  UpdatedResponseSchema,
} from "./RelicRulesTypes";

export const relicRulesRouter = registerSingletonRoutes({
  basePath: "/relic-rules",
  tag: "relic-rules",
  subject: "relic system",
  validatesPairs: true,
  schemas: {
    resource: RelicRuleSchema,
    updateBody: UpdateRelicRulesBodySchema,
    updatedResponse: UpdatedResponseSchema,
  },
  controllers: relicRulesController,
});
