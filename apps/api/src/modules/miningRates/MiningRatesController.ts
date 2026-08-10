import type { RequestHandler } from "express";
import { miningRatesService } from "./MiningRatesService";
import type { BatchUpsertMiningRatesBody, UpsertMiningRateBody } from "./MiningRatesTypes";

export const miningRatesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await miningRatesService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        classCode: q.classCode,
        biomeCode: q.biomeCode,
        itemCode: q.itemCode,
      }),
    );
  }) satisfies RequestHandler,

  upsert: (async (req, res) => {
    res.status(201).json(await miningRatesService.upsert(req.body as UpsertMiningRateBody));
  }) satisfies RequestHandler,

  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(await miningRatesService.batchUpsert(req.body as BatchUpsertMiningRatesBody));
  }) satisfies RequestHandler,
};
