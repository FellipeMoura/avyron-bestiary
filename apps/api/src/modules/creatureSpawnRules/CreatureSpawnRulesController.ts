import type { RequestHandler } from "express";
import { creatureSpawnRulesService } from "./CreatureSpawnRulesService";
import type {
  BatchUpsertCreatureSpawnRulesBody,
  UpsertCreatureSpawnRuleBody,
} from "./CreatureSpawnRulesTypes";

export const creatureSpawnRulesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await creatureSpawnRulesService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        parentCode: q.creatureCode,
      }),
    );
  }) satisfies RequestHandler,
  getByParentCode: (async (req, res) => {
    res.json(await creatureSpawnRulesService.getByParentCode(req.params.code as string));
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res
      .status(201)
      .json(await creatureSpawnRulesService.upsert(req.body as UpsertCreatureSpawnRuleBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(
        await creatureSpawnRulesService.batchUpsert(
          req.body as BatchUpsertCreatureSpawnRulesBody,
        ),
      );
  }) satisfies RequestHandler,
};
