import type { RequestHandler } from "express";
import { relicsService } from "./RelicsService";
import type { BatchCreateRelicsBody, CreateRelicBody, UpdateRelicBody } from "./RelicsTypes";

export const relicsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    const rows = await relicsService.list({
      limit: q.limit,
      offset: q.offset,
      fields: q.fields,
      classCode: q.classCode,
      elementCode: q.elementCode,
    });
    res.json(rows);
  }) satisfies RequestHandler,

  getByCode: (async (req, res) => {
    const row = await relicsService.getByCode(req.params.code!);
    res.json(row);
  }) satisfies RequestHandler,

  create: (async (req, res) => {
    const result = await relicsService.create(req.body as CreateRelicBody);
    res.status(201).json(result);
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const result = await relicsService.update(req.params.code!, req.body as UpdateRelicBody);
    res.status(200).json(result);
  }) satisfies RequestHandler,

  batchCreate: (async (req, res) => {
    const result = await relicsService.batchCreate(req.body as BatchCreateRelicsBody);
    res.status(201).json(result);
  }) satisfies RequestHandler,
};
