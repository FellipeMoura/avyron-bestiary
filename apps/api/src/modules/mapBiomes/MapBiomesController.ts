import type { RequestHandler } from "express";
import { mapBiomesService } from "./MapBiomesService";
import type { BatchUpsertMapBiomesBody, UpsertMapBiomeBody } from "./MapBiomesTypes";

export const mapBiomesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await mapBiomesService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        mapCode: q.mapCode,
        biomeCode: q.biomeCode,
      }),
    );
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await mapBiomesService.upsert(req.body as UpsertMapBiomeBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res.status(201).json(await mapBiomesService.batchUpsert(req.body as BatchUpsertMapBiomesBody));
  }) satisfies RequestHandler,
};
