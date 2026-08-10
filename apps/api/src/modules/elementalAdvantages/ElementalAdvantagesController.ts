import type { RequestHandler } from "express";
import { elementalAdvantagesService } from "./ElementalAdvantagesService";
import type {
  BatchUpsertElementalAdvantagesBody,
  UpsertElementalAdvantageBody,
} from "./ElementalAdvantagesTypes";

export const elementalAdvantagesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await elementalAdvantagesService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        attackerCode: q.attackerCode,
        defenderCode: q.defenderCode,
      }),
    );
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res
      .status(201)
      .json(await elementalAdvantagesService.upsert(req.body as UpsertElementalAdvantageBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(
        await elementalAdvantagesService.batchUpsert(req.body as BatchUpsertElementalAdvantagesBody),
      );
  }) satisfies RequestHandler,
};
