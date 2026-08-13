import type { RequestHandler } from "express";
import { creatureAbilitiesService } from "./CreatureAbilitiesService";
import type {
  BatchUpsertCreatureAbilitiesBody,
  DeleteCreatureAbilityBody,
  UpsertCreatureAbilityBody,
} from "./CreatureAbilitiesTypes";

export const creatureAbilitiesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await creatureAbilitiesService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        creatureCode: q.creatureCode,
        abilityCode: q.abilityCode,
      }),
    );
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res
      .status(201)
      .json(await creatureAbilitiesService.upsert(req.body as UpsertCreatureAbilityBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(
        await creatureAbilitiesService.batchUpsert(req.body as BatchUpsertCreatureAbilitiesBody),
      );
  }) satisfies RequestHandler,
  delete: (async (req, res) => {
    res
      .status(200)
      .json(await creatureAbilitiesService.remove(req.body as DeleteCreatureAbilityBody));
  }) satisfies RequestHandler,
};
