import { registerChildUpsertRoutes } from "../../shared/services/childUpsertRoutes";
import { relicStatsController } from "./RelicStatsController";
import {
  BatchUpsertRelicStatsBodySchema,
  BatchUpsertResponseSchema,
  ListRelicStatsQuerySchema,
  RelicCodeParamsSchema,
  RelicStatSchema,
  UpsertRelicStatBodySchema,
  UpsertResponseSchema,
} from "./RelicStatsTypes";

export const relicStatsRouter = registerChildUpsertRoutes({
  basePath: "/relic-stats",
  tag: "relic-stats",
  parentNoun: "relic",
  schemas: {
    listQuery: ListRelicStatsQuerySchema,
    codeParams: RelicCodeParamsSchema,
    upsertBody: UpsertRelicStatBodySchema,
    batchUpsertBody: BatchUpsertRelicStatsBodySchema,
    resource: RelicStatSchema,
    upsertedResponse: UpsertResponseSchema,
    batchUpsertedResponse: BatchUpsertResponseSchema,
  },
  controllers: relicStatsController,
});
