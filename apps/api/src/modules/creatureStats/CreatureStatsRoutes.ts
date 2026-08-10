import { registerChildUpsertRoutes } from "../../shared/services/childUpsertRoutes";
import { creatureStatsController } from "./CreatureStatsController";
import {
  BatchUpsertCreatureStatsBodySchema,
  BatchUpsertResponseSchema,
  CreatureCodeParamsSchema,
  CreatureStatSchema,
  ListCreatureStatsQuerySchema,
  UpsertCreatureStatBodySchema,
  UpsertResponseSchema,
} from "./CreatureStatsTypes";

export const creatureStatsRouter = registerChildUpsertRoutes({
  basePath: "/creature-stats",
  tag: "creature-stats",
  parentNoun: "creature",
  schemas: {
    listQuery: ListCreatureStatsQuerySchema,
    codeParams: CreatureCodeParamsSchema,
    upsertBody: UpsertCreatureStatBodySchema,
    batchUpsertBody: BatchUpsertCreatureStatsBodySchema,
    resource: CreatureStatSchema,
    upsertedResponse: UpsertResponseSchema,
    batchUpsertedResponse: BatchUpsertResponseSchema,
  },
  controllers: creatureStatsController,
});
