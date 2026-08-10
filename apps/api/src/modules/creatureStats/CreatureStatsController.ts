import type { RequestHandler } from "express";
import { creatureStatsService } from "./CreatureStatsService";
import type { BatchUpsertCreatureStatsBody, UpsertCreatureStatBody } from "./CreatureStatsTypes";

export const creatureStatsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await creatureStatsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        parentCode: q.creatureCode,
      }),
    );
  }) satisfies RequestHandler,
  getByParentCode: (async (req, res) => {
    res.json(await creatureStatsService.getByParentCode(req.params.code as string));
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await creatureStatsService.upsert(req.body as UpsertCreatureStatBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(await creatureStatsService.batchUpsert(req.body as BatchUpsertCreatureStatsBody));
  }) satisfies RequestHandler,
};
