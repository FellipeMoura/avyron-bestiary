import type { RequestHandler } from "express";
import { itemStatsService } from "./ItemStatsService";
import type { BatchUpsertItemStatsBody, UpsertItemStatBody } from "./ItemStatsTypes";

export const itemStatsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await itemStatsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        parentCode: q.itemCode,
      }),
    );
  }) satisfies RequestHandler,
  getByParentCode: (async (req, res) => {
    res.json(await itemStatsService.getByParentCode(req.params.code as string));
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await itemStatsService.upsert(req.body as UpsertItemStatBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res.status(201).json(await itemStatsService.batchUpsert(req.body as BatchUpsertItemStatsBody));
  }) satisfies RequestHandler,
};
