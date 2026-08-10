import type { RequestHandler } from "express";
import { abilityStatsService } from "./AbilityStatsService";
import type { BatchUpsertAbilityStatsBody, UpsertAbilityStatBody } from "./AbilityStatsTypes";

export const abilityStatsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await abilityStatsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        parentCode: q.abilityCode,
      }),
    );
  }) satisfies RequestHandler,
  getByParentCode: (async (req, res) => {
    res.json(await abilityStatsService.getByParentCode(req.params.code as string));
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await abilityStatsService.upsert(req.body as UpsertAbilityStatBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(await abilityStatsService.batchUpsert(req.body as BatchUpsertAbilityStatsBody));
  }) satisfies RequestHandler,
};
