import type { RequestHandler } from "express";
import { elementsService } from "./ElementsService";
import type {
  BatchCreateElementsBody,
  CreateElementBody,
  DeleteElementBody,
  UpdateElementBody,
} from "./ElementsTypes";

export const elementsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    const rows = await elementsService.list({
      limit: q.limit,
      offset: q.offset,
      fields: q.fields,
      name: q.name,
    });
    res.json(rows);
  }) satisfies RequestHandler,

  getByCode: (async (req, res) => {
    const row = await elementsService.getByCode(req.params.code!);
    res.json(row);
  }) satisfies RequestHandler,

  create: (async (req, res) => {
    const result = await elementsService.create(req.body as CreateElementBody);
    res.status(201).json(result);
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const result = await elementsService.update(req.params.code!, req.body as UpdateElementBody);
    res.status(200).json(result);
  }) satisfies RequestHandler,

  batchCreate: (async (req, res) => {
    const result = await elementsService.batchCreate(req.body as BatchCreateElementsBody);
    res.status(201).json(result);
  }) satisfies RequestHandler,

  delete: (async (req, res) => {
    const result = await elementsService.remove(req.params.code!, req.body as DeleteElementBody);
    res.status(200).json(result);
  }) satisfies RequestHandler,
};
