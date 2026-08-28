import type { RequestHandler } from "express";
import { npcDuelistsService } from "./NpcDuelistsService";
import type { BatchUpsertNpcDuelistsBody, UpsertNpcDuelistBody } from "./NpcDuelistsTypes";

export const npcDuelistsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await npcDuelistsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        npcCode: q.npcCode,
        glyphCode: q.glyphCode,
      }),
    );
  }) satisfies RequestHandler,
  getByParentCode: (async (req, res) => {
    res.json(await npcDuelistsService.getByParentCode(req.params.code!));
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await npcDuelistsService.upsert(req.body as UpsertNpcDuelistBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(await npcDuelistsService.batchUpsert(req.body as BatchUpsertNpcDuelistsBody));
  }) satisfies RequestHandler,
};
