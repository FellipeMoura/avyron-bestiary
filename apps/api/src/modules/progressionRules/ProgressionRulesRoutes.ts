import { Router } from "express";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { progressionRulesController } from "./ProgressionRulesController";
import {
  ProgressionRuleSchema,
  UpdateProgressionRulesBodySchema,
  UpdatedResponseSchema,
} from "./ProgressionRulesTypes";

export const progressionRulesRouter = Router();
const TAG = "progression-rules";

registry.registerPath({
  method: "get",
  path: "/progression-rules",
  tags: [TAG],
  summary: "Get the level-up constants (singleton)",
  description:
    "Subir de nível exige XP acumulado E material consumido. " +
    "xpToNext(nível) = floor(xpCurveBase * nível ^ xpCurveExponent); " +
    "xpGanho = floor(alvo.xpYield * nívelDoAlvo / xpYieldDivisor); " +
    "custo(nível) = itemCostBase + floor(nível / itemCostLevelStep) unidades do item " +
    "`category: material` da classe da própria criatura que sobe.",
  responses: {
    200: { content: { "application/json": { schema: ProgressionRuleSchema } }, description: "OK" },
  },
});
progressionRulesRouter.get("/", progressionRulesController.get);

registry.registerPath({
  method: "patch",
  path: "/progression-rules",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Tune one or more level-up constants",
  request: {
    body: {
      content: { "application/json": { schema: UpdateProgressionRulesBodySchema } },
      required: true,
    },
  },
  responses: {
    200: { content: { "application/json": { schema: UpdatedResponseSchema } }, description: "Updated" },
    422: { description: "Validation failed" },
  },
});
progressionRulesRouter.patch(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpdateProgressionRulesBodySchema),
  progressionRulesController.update,
);
