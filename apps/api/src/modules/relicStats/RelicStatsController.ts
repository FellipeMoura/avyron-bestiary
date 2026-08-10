import type { RequestHandler } from "express";
import { relicStatsService } from "./RelicStatsService";
import type { BatchUpsertRelicStatsBody, UpsertRelicStatBody } from "./RelicStatsTypes";

export const relicStatsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await relicStatsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        parentCode: q.relicCode,
      }),
    );
  }) satisfies RequestHandler,
  getByParentCode: (async (req, res) => {
    res.json(await relicStatsService.getByParentCode(req.params.code as string));
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await relicStatsService.upsert(req.body as UpsertRelicStatBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res.status(201).json(await relicStatsService.batchUpsert(req.body as BatchUpsertRelicStatsBody));
  }) satisfies RequestHandler,
};
