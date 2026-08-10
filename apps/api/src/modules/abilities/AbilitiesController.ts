import type { RequestHandler } from "express";
import { abilitiesService } from "./AbilitiesService";
import type {
  BatchCreateAbilitiesBody,
  CreateAbilityBody,
  UpdateAbilityBody,
} from "./AbilitiesTypes";

export const abilitiesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await abilitiesService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        elementCode: q.elementCode,
        type: q.type,
        awakeningOnly: q.awakeningOnly,
      }),
    );
  }) satisfies RequestHandler,
  getByCode: (async (req, res) => {
    res.json(await abilitiesService.getByCode(req.params.code!));
  }) satisfies RequestHandler,
  create: (async (req, res) => {
    res.status(201).json(await abilitiesService.create(req.body as CreateAbilityBody));
  }) satisfies RequestHandler,
  update: (async (req, res) => {
    res.status(200).json(
      await abilitiesService.update(req.params.code!, req.body as UpdateAbilityBody),
    );
  }) satisfies RequestHandler,
  batchCreate: (async (req, res) => {
    res.status(201).json(await abilitiesService.batchCreate(req.body as BatchCreateAbilitiesBody));
  }) satisfies RequestHandler,
};
