import type { RequestHandler } from "express";
import { economyRulesService } from "./EconomyRulesService";
import type { UpdateEconomyRulesBody } from "./EconomyRulesTypes";

export const economyRulesController = {
  get: (async (_req, res) => {
    res.json(await economyRulesService.get());
  }) satisfies RequestHandler,
  update: (async (req, res) => {
    res.json(await economyRulesService.update(req.body as UpdateEconomyRulesBody));
  }) satisfies RequestHandler,
};
