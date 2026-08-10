import type { RequestHandler } from "express";
import { relicRulesService } from "./RelicRulesService";
import type { UpdateRelicRulesBody } from "./RelicRulesTypes";

export const relicRulesController = {
  get: (async (_req, res) => {
    res.json(await relicRulesService.get());
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    res.status(200).json(await relicRulesService.update(req.body as UpdateRelicRulesBody));
  }) satisfies RequestHandler,
};
