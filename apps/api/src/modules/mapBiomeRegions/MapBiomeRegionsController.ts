import type { RequestHandler } from "express";
import { mapBiomeRegionsService } from "./MapBiomeRegionsService";
import type {
  BatchCreateMapBiomeRegionsBody,
  CreateMapBiomeRegionBody,
  DeleteMapBiomeRegionBody,
  UpdateMapBiomeRegionBody,
} from "./MapBiomeRegionsTypes";

export const mapBiomeRegionsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await mapBiomeRegionsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        mapCode: q.mapCode,
        biomeCode: q.biomeCode,
      }),
    );
  }) satisfies RequestHandler,
  getByCode: (async (req, res) => {
    res.json(await mapBiomeRegionsService.getByCode(req.params.code!));
  }) satisfies RequestHandler,
  create: (async (req, res) => {
    res.status(201).json(await mapBiomeRegionsService.create(req.body as CreateMapBiomeRegionBody));
  }) satisfies RequestHandler,
  update: (async (req, res) => {
    res
      .status(200)
      .json(
        await mapBiomeRegionsService.update(
          req.params.code!,
          req.body as UpdateMapBiomeRegionBody,
        ),
      );
  }) satisfies RequestHandler,
  batchCreate: (async (req, res) => {
    res
      .status(201)
      .json(await mapBiomeRegionsService.batchCreate(req.body as BatchCreateMapBiomeRegionsBody));
  }) satisfies RequestHandler,
  delete: (async (req, res) => {
    res
      .status(200)
      .json(
        await mapBiomeRegionsService.remove(
          req.params.code!,
          req.body as DeleteMapBiomeRegionBody,
        ),
      );
  }) satisfies RequestHandler,
};
