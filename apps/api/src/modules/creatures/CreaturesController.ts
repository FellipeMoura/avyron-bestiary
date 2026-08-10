import type { RequestHandler } from "express";
import { creaturesService } from "./CreaturesService";
import type {
  BatchCreateCreaturesBody,
  CreateCreatureBody,
  UpdateCreatureBody,
} from "./CreaturesTypes";

export const creaturesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    const rows = await creaturesService.list({
      limit: q.limit,
      offset: q.offset,
      fields: q.fields,
      era: q.era,
      classCode: q.classCode,
      elementCode: q.elementCode,
      mapCode: q.mapCode,
      biomeCode: q.biomeCode,
    });
    res.json(rows);
  }) satisfies RequestHandler,

  getByCode: (async (req, res) => {
    const row = await creaturesService.getByCode(req.params.code!);
    res.json(row);
  }) satisfies RequestHandler,

  create: (async (req, res) => {
    const result = await creaturesService.create(req.body as CreateCreatureBody);
    res.status(201).json(result);
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const result = await creaturesService.update(req.params.code!, req.body as UpdateCreatureBody);
    res.status(200).json(result);
  }) satisfies RequestHandler,

  batchCreate: (async (req, res) => {
    const result = await creaturesService.batchCreate(req.body as BatchCreateCreaturesBody);
    res.status(201).json(result);
  }) satisfies RequestHandler,

  delete: (async (req, res) => {
    const result = await creaturesService.remove(
      req.params.code!,
      req.body as { reason: string; impact: string },
    );
    res.status(200).json(result);
  }) satisfies RequestHandler,
};
