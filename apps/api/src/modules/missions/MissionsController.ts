import type { RequestHandler } from "express";
import { missionsService } from "./MissionsService";
import type {
  BatchCreateMissionsBody,
  CreateMissionBody,
  UpdateMissionBody,
} from "./MissionsTypes";

export const missionsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await missionsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        mapCode: q.mapCode,
        npcCode: q.npcCode,
        type: q.type,
      }),
    );
  }) satisfies RequestHandler,
  getByCode: (async (req, res) => {
    res.json(await missionsService.getByCode(req.params.code!));
  }) satisfies RequestHandler,
  create: (async (req, res) => {
    res.status(201).json(await missionsService.create(req.body as CreateMissionBody));
  }) satisfies RequestHandler,
  update: (async (req, res) => {
    res.status(200).json(await missionsService.update(req.params.code!, req.body as UpdateMissionBody));
  }) satisfies RequestHandler,
  batchCreate: (async (req, res) => {
    res.status(201).json(await missionsService.batchCreate(req.body as BatchCreateMissionsBody));
  }) satisfies RequestHandler,
};
