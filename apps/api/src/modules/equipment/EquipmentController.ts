import type { RequestHandler } from "express";
import { equipmentService } from "./EquipmentService";
import type {
  BatchCreateEquipmentBody,
  CreateEquipmentBody,
  UpdateEquipmentBody,
} from "./EquipmentTypes";

export const equipmentController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    const rows = await equipmentService.list({
      limit: q.limit,
      offset: q.offset,
      fields: q.fields,
      slot: q.slot,
    });
    res.json(rows);
  }) satisfies RequestHandler,

  getByCode: (async (req, res) => {
    const row = await equipmentService.getByCode(req.params.code!);
    res.json(row);
  }) satisfies RequestHandler,

  create: (async (req, res) => {
    const result = await equipmentService.create(req.body as CreateEquipmentBody);
    res.status(201).json(result);
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const result = await equipmentService.update(req.params.code!, req.body as UpdateEquipmentBody);
    res.status(200).json(result);
  }) satisfies RequestHandler,

  batchCreate: (async (req, res) => {
    const result = await equipmentService.batchCreate(req.body as BatchCreateEquipmentBody);
    res.status(201).json(result);
  }) satisfies RequestHandler,
};
