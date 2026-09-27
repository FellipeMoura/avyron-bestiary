import type { RequestHandler } from "express";
import { arenaStagesService } from "./ArenaStagesService";
import type { BatchUpsertArenaStagesBody, UpsertArenaStageBody } from "./ArenaStagesTypes";

export const arenaStagesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await arenaStagesService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        npcCode: q.npcCode,
      }),
    );
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await arenaStagesService.upsert(req.body as UpsertArenaStageBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(await arenaStagesService.batchUpsert(req.body as BatchUpsertArenaStagesBody));
  }) satisfies RequestHandler,
};
