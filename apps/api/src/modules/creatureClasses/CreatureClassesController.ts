import type { RequestHandler } from "express";
import { creatureClassesService } from "./CreatureClassesService";
import type {
  BatchCreateCreatureClassesBody,
  CreateCreatureClassBody,
  DeleteCreatureClassBody,
  UpdateCreatureClassBody,
} from "./CreatureClassesTypes";

export const creatureClassesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    const rows = await creatureClassesService.list({
      limit: q.limit,
      offset: q.offset,
      fields: q.fields,
    });
    res.json(rows);
  }) satisfies RequestHandler,

  getByCode: (async (req, res) => {
    const row = await creatureClassesService.getByCode(req.params.code!);
    res.json(row);
  }) satisfies RequestHandler,

  create: (async (req, res) => {
    const result = await creatureClassesService.create(req.body as CreateCreatureClassBody);
    res.status(201).json(result);
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const result = await creatureClassesService.update(
      req.params.code!,
      req.body as UpdateCreatureClassBody,
    );
    res.status(200).json(result);
  }) satisfies RequestHandler,

  batchCreate: (async (req, res) => {
    const result = await creatureClassesService.batchCreate(
      req.body as BatchCreateCreatureClassesBody,
    );
    res.status(201).json(result);
  }) satisfies RequestHandler,

  delete: (async (req, res) => {
    const result = await creatureClassesService.remove(
      req.params.code!,
      req.body as DeleteCreatureClassBody,
    );
    res.status(200).json(result);
  }) satisfies RequestHandler,
};
