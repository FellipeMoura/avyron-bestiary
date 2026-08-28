import type { RequestHandler } from "express";
import { glyphsService } from "./GlyphsService";
import type {
  BatchCreateGlyphsBody,
  CreateGlyphBody,
  DeleteGlyphBody,
  UpdateGlyphBody,
} from "./GlyphsTypes";

export const glyphsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(await glyphsService.list({ limit: q.limit, offset: q.offset, fields: q.fields }));
  }) satisfies RequestHandler,
  getByCode: (async (req, res) => {
    res.json(await glyphsService.getByCode(req.params.code!));
  }) satisfies RequestHandler,
  create: (async (req, res) => {
    res.status(201).json(await glyphsService.create(req.body as CreateGlyphBody));
  }) satisfies RequestHandler,
  update: (async (req, res) => {
    res.status(200).json(await glyphsService.update(req.params.code!, req.body as UpdateGlyphBody));
  }) satisfies RequestHandler,
  batchCreate: (async (req, res) => {
    res.status(201).json(await glyphsService.batchCreate(req.body as BatchCreateGlyphsBody));
  }) satisfies RequestHandler,
  delete: (async (req, res) => {
    res.status(200).json(await glyphsService.remove(req.params.code!, req.body as DeleteGlyphBody));
  }) satisfies RequestHandler,
};
