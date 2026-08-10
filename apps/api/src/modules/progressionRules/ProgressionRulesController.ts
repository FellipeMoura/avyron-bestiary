import type { RequestHandler } from "express";
import { progressionRulesService } from "./ProgressionRulesService";
import type { UpdateProgressionRulesBody } from "./ProgressionRulesTypes";

export const progressionRulesController = {
  get: (async (_req, res) => {
    res.json(await progressionRulesService.get());
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    res
      .status(200)
      .json(await progressionRulesService.update(req.body as UpdateProgressionRulesBody));
  }) satisfies RequestHandler,
};
