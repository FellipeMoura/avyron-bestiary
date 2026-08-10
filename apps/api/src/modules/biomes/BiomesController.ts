import type { RequestHandler } from "express";
import { biomesService } from "./BiomesService";
import type {
  BatchCreateBiomesBody,
  CreateBiomeBody,
  DeleteBiomeBody,
  UpdateBiomeBody,
} from "./BiomesTypes";

export const biomesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(await biomesService.list({ limit: q.limit, offset: q.offset, fields: q.fields }));
  }) satisfies RequestHandler,
  getByCode: (async (req, res) => {
    res.json(await biomesService.getByCode(req.params.code!));
  }) satisfies RequestHandler,
  create: (async (req, res) => {
    res.status(201).json(await biomesService.create(req.body as CreateBiomeBody));
  }) satisfies RequestHandler,
  update: (async (req, res) => {
    res.status(200).json(await biomesService.update(req.params.code!, req.body as UpdateBiomeBody));
  }) satisfies RequestHandler,
  batchCreate: (async (req, res) => {
    res.status(201).json(await biomesService.batchCreate(req.body as BatchCreateBiomesBody));
  }) satisfies RequestHandler,
  delete: (async (req, res) => {
    res
      .status(200)
      .json(await biomesService.remove(req.params.code!, req.body as DeleteBiomeBody));
  }) satisfies RequestHandler,
};
