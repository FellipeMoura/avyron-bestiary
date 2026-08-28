import type { RequestHandler } from "express";
import { equipmentStatsService } from "./EquipmentStatsService";
import type {
  BatchUpsertEquipmentStatsBody,
  UpsertEquipmentStatBody,
} from "./EquipmentStatsTypes";

export const equipmentStatsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await equipmentStatsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        parentCode: q.equipmentCode,
      }),
    );
  }) satisfies RequestHandler,
  getByParentCode: (async (req, res) => {
    res.json(await equipmentStatsService.getByParentCode(req.params.code as string));
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await equipmentStatsService.upsert(req.body as UpsertEquipmentStatBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(await equipmentStatsService.batchUpsert(req.body as BatchUpsertEquipmentStatsBody));
  }) satisfies RequestHandler,
};
