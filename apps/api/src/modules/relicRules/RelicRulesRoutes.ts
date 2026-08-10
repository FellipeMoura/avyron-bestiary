import { Router } from "express";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { relicRulesController } from "./RelicRulesController";
import {
  RelicRuleSchema,
  UpdateRelicRulesBodySchema,
  UpdatedResponseSchema,
} from "./RelicRulesTypes";

export const relicRulesRouter = Router();
const TAG = "relic-rules";

registry.registerPath({
  method: "get",
  path: "/relic-rules",
  tags: [TAG],
  summary: "Get the relic system constants (singleton)",
  responses: {
    200: { content: { "application/json": { schema: RelicRuleSchema } }, description: "OK" },
  },
});
relicRulesRouter.get("/", relicRulesController.get);

registry.registerPath({
  method: "patch",
  path: "/relic-rules",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Tune one or more relic system constants",
  request: {
    body: { content: { "application/json": { schema: UpdateRelicRulesBodySchema } }, required: true },
  },
  responses: {
    200: { content: { "application/json": { schema: UpdatedResponseSchema } }, description: "Updated" },
    422: { description: "Validation failed or inconsistent pair" },
  },
});
relicRulesRouter.patch(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpdateRelicRulesBodySchema),
  relicRulesController.update,
);
