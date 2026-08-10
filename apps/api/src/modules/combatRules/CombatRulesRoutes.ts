import { Router } from "express";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { combatRulesController } from "./CombatRulesController";
import {
  CombatRuleSchema,
  UpdateCombatRulesBodySchema,
  UpdatedResponseSchema,
} from "./CombatRulesTypes";

export const combatRulesRouter = Router();
const TAG = "combat-rules";

registry.registerPath({
  method: "get",
  path: "/combat-rules",
  tags: [TAG],
  summary: "Get the combat constants (singleton)",
  responses: {
    200: { content: { "application/json": { schema: CombatRuleSchema } }, description: "OK" },
  },
});
combatRulesRouter.get("/", combatRulesController.get);

registry.registerPath({
  method: "patch",
  path: "/combat-rules",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Tune one or more combat constants",
  request: {
    body: { content: { "application/json": { schema: UpdateCombatRulesBodySchema } }, required: true },
  },
  responses: {
    200: { content: { "application/json": { schema: UpdatedResponseSchema } }, description: "Updated" },
    422: { description: "Validation failed or inconsistent pair" },
  },
});
combatRulesRouter.patch(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpdateCombatRulesBodySchema),
  combatRulesController.update,
);
