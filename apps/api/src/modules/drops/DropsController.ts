import type { RequestHandler } from "express";
import { dropsService } from "./DropsService";
import type { BatchUpsertDropsBody, UpsertDropBody } from "./DropsTypes";

export const dropsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await dropsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        creatureCode: q.creatureCode,
        itemCode: q.itemCode,
      }),
    );
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await dropsService.upsert(req.body as UpsertDropBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res.status(201).json(await dropsService.batchUpsert(req.body as BatchUpsertDropsBody));
  }) satisfies RequestHandler,
};
