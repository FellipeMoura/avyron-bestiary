import { Router } from "express";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { economyRulesController } from "./EconomyRulesController";
import {
  EconomyRuleSchema,
  UpdateEconomyRulesBodySchema,
  UpdatedResponseSchema,
} from "./EconomyRulesTypes";

export const economyRulesRouter = Router();
const TAG = "economy-rules";

registry.registerPath({
  method: "get",
  path: "/economy-rules",
  tags: [TAG],
  summary: "Get the economy constants (singleton)",
  description:
    "Currency name, starting purse and the merchant's buy/sell spread. The game reads these " +
    "from the exported bundle — no economy constant lives in Godot code.",
  responses: {
    200: { content: { "application/json": { schema: EconomyRuleSchema } }, description: "OK" },
  },
});
economyRulesRouter.get("/", economyRulesController.get);

registry.registerPath({
  method: "patch",
  path: "/economy-rules",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Tune one or more economy constants",
  request: {
    body: {
      content: { "application/json": { schema: UpdateEconomyRulesBodySchema } },
      required: true,
    },
  },
  responses: {
    200: { content: { "application/json": { schema: UpdatedResponseSchema } }, description: "Updated" },
    422: { description: "Validation failed" },
  },
});
economyRulesRouter.patch(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpdateEconomyRulesBodySchema),
  economyRulesController.update,
);
