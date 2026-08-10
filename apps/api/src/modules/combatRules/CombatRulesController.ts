import type { RequestHandler } from "express";
import { combatRulesService } from "./CombatRulesService";
import type { UpdateCombatRulesBody } from "./CombatRulesTypes";

export const combatRulesController = {
  get: (async (_req, res) => {
    res.json(await combatRulesService.get());
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    res.status(200).json(await combatRulesService.update(req.body as UpdateCombatRulesBody));
  }) satisfies RequestHandler,
};
