import type { RequestHandler } from "express";
import { captureRulesService } from "./CaptureRulesService";
import type { BatchUpsertCaptureRulesBody, UpsertCaptureRuleBody } from "./CaptureRulesTypes";

export const captureRulesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await captureRulesService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        parentCode: q.creatureCode,
      }),
    );
  }) satisfies RequestHandler,
  getByParentCode: (async (req, res) => {
    res.json(await captureRulesService.getByParentCode(req.params.code as string));
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await captureRulesService.upsert(req.body as UpsertCaptureRuleBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(await captureRulesService.batchUpsert(req.body as BatchUpsertCaptureRulesBody));
  }) satisfies RequestHandler,
};
