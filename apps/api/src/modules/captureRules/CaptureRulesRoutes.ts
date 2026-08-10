import { registerChildUpsertRoutes } from "../../shared/services/childUpsertRoutes";
import { captureRulesController } from "./CaptureRulesController";
import {
  BatchUpsertCaptureRulesBodySchema,
  BatchUpsertResponseSchema,
  CaptureRuleSchema,
  CreatureCodeParamsSchema,
  ListCaptureRulesQuerySchema,
  UpsertCaptureRuleBodySchema,
  UpsertResponseSchema,
} from "./CaptureRulesTypes";

export const captureRulesRouter = registerChildUpsertRoutes({
  basePath: "/capture-rules",
  tag: "capture-rules",
  parentNoun: "creature",
  schemas: {
    listQuery: ListCaptureRulesQuerySchema,
    codeParams: CreatureCodeParamsSchema,
    upsertBody: UpsertCaptureRuleBodySchema,
    batchUpsertBody: BatchUpsertCaptureRulesBodySchema,
    resource: CaptureRuleSchema,
    upsertedResponse: UpsertResponseSchema,
    batchUpsertedResponse: BatchUpsertResponseSchema,
  },
  controllers: captureRulesController,
});
