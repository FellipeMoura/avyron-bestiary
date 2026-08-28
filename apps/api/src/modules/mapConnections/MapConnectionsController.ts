import type { RequestHandler } from "express";
import { mapConnectionsService } from "./MapConnectionsService";
import type {
  BatchUpsertMapConnectionsBody,
  UpsertMapConnectionBody,
} from "./MapConnectionsTypes";

export const mapConnectionsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await mapConnectionsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        fromMapCode: q.fromMapCode,
        toMapCode: q.toMapCode,
        glyphCode: q.glyphCode,
      }),
    );
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await mapConnectionsService.upsert(req.body as UpsertMapConnectionBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(await mapConnectionsService.batchUpsert(req.body as BatchUpsertMapConnectionsBody));
  }) satisfies RequestHandler,
};
