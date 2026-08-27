import type { RequestHandler } from "express";
import { npcAppearancesService } from "./NpcAppearancesService";
import type { BatchUpsertNpcAppearancesBody, UpsertNpcAppearanceBody } from "./NpcAppearancesTypes";

export const npcAppearancesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await npcAppearancesService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        parentCode: q.npcCode,
      }),
    );
  }) satisfies RequestHandler,
  getByParentCode: (async (req, res) => {
    res.json(await npcAppearancesService.getByParentCode(req.params.code as string));
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await npcAppearancesService.upsert(req.body as UpsertNpcAppearanceBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(await npcAppearancesService.batchUpsert(req.body as BatchUpsertNpcAppearancesBody));
  }) satisfies RequestHandler,
};
