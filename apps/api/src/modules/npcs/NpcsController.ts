import type { RequestHandler } from "express";
import { npcsService } from "./NpcsService";
import type { BatchCreateNpcsBody, CreateNpcBody, UpdateNpcBody } from "./NpcsTypes";

export const npcsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await npcsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        mapCode: q.mapCode,
        faction: q.faction,
        role: q.role,
      }),
    );
  }) satisfies RequestHandler,
  getByCode: (async (req, res) => {
    res.json(await npcsService.getByCode(req.params.code!));
  }) satisfies RequestHandler,
  create: (async (req, res) => {
    res.status(201).json(await npcsService.create(req.body as CreateNpcBody));
  }) satisfies RequestHandler,
  update: (async (req, res) => {
    res.status(200).json(await npcsService.update(req.params.code!, req.body as UpdateNpcBody));
  }) satisfies RequestHandler,
  batchCreate: (async (req, res) => {
    res.status(201).json(await npcsService.batchCreate(req.body as BatchCreateNpcsBody));
  }) satisfies RequestHandler,
};
