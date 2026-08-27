import { registerSingletonRoutes } from "../../shared/services/singletonRoutes";
import { progressionRulesController } from "./ProgressionRulesController";
import {
  ProgressionRuleSchema,
  UpdateProgressionRulesBodySchema,
  UpdatedResponseSchema,
} from "./ProgressionRulesTypes";

export const progressionRulesRouter = registerSingletonRoutes({
  basePath: "/progression-rules",
  tag: "progression-rules",
  subject: "level-up",
  description:
    "Subir de nível exige XP acumulado E material consumido. " +
    "xpToNext(nível) = floor(xpCurveBase * nível ^ xpCurveExponent); " +
    "xpGanho = floor(alvo.xpYield * nívelDoAlvo / xpYieldDivisor); " +
    "custo(nível) = itemCostBase + floor(nível / itemCostLevelStep) unidades do item " +
    "`category: material` da classe da própria criatura que sobe.",
  schemas: {
    resource: ProgressionRuleSchema,
    updateBody: UpdateProgressionRulesBodySchema,
    updatedResponse: UpdatedResponseSchema,
  },
  controllers: progressionRulesController,
});
