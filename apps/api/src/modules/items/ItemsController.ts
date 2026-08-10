import type { RequestHandler } from "express";
import { itemsService } from "./ItemsService";
import type {
  BatchCreateItemsBody,
  CreateItemBody,
  DeleteItemBody,
  UpdateItemBody,
} from "./ItemsTypes";

export const itemsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await itemsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        category: q.category,
      }),
    );
  }) satisfies RequestHandler,
  getByCode: (async (req, res) => {
    res.json(await itemsService.getByCode(req.params.code!));
  }) satisfies RequestHandler,
  create: (async (req, res) => {
    res.status(201).json(await itemsService.create(req.body as CreateItemBody));
  }) satisfies RequestHandler,
  update: (async (req, res) => {
    res.status(200).json(await itemsService.update(req.params.code!, req.body as UpdateItemBody));
  }) satisfies RequestHandler,
  batchCreate: (async (req, res) => {
    res.status(201).json(await itemsService.batchCreate(req.body as BatchCreateItemsBody));
  }) satisfies RequestHandler,
  delete: (async (req, res) => {
    res.status(200).json(await itemsService.remove(req.params.code!, req.body as DeleteItemBody));
  }) satisfies RequestHandler,
};
