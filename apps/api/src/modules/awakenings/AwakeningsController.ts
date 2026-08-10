import type { RequestHandler } from "express";
import { awakeningsService } from "./AwakeningsService";
import type {
  BatchCreateAwakeningsBody,
  CreateAwakeningBody,
  UpdateAwakeningBody,
} from "./AwakeningsTypes";

export const awakeningsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await awakeningsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        creatureCode: q.creatureCode,
        type: q.type,
      }),
    );
  }) satisfies RequestHandler,
  getByCode: (async (req, res) => {
    res.json(await awakeningsService.getByCode(req.params.code!));
  }) satisfies RequestHandler,
  create: (async (req, res) => {
    res.status(201).json(await awakeningsService.create(req.body as CreateAwakeningBody));
  }) satisfies RequestHandler,
  update: (async (req, res) => {
    res
      .status(200)
      .json(await awakeningsService.update(req.params.code!, req.body as UpdateAwakeningBody));
  }) satisfies RequestHandler,
  batchCreate: (async (req, res) => {
    res.status(201).json(await awakeningsService.batchCreate(req.body as BatchCreateAwakeningsBody));
  }) satisfies RequestHandler,
};
