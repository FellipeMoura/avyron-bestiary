import { registerChildUpsertRoutes } from "../../shared/services/childUpsertRoutes";
import { abilityStatsController } from "./AbilityStatsController";
import {
  AbilityCodeParamsSchema,
  AbilityStatSchema,
  BatchUpsertAbilityStatsBodySchema,
  BatchUpsertResponseSchema,
  ListAbilityStatsQuerySchema,
  UpsertAbilityStatBodySchema,
  UpsertResponseSchema,
} from "./AbilityStatsTypes";

export const abilityStatsRouter = registerChildUpsertRoutes({
  basePath: "/ability-stats",
  tag: "ability-stats",
  parentNoun: "ability",
  schemas: {
    listQuery: ListAbilityStatsQuerySchema,
    codeParams: AbilityCodeParamsSchema,
    upsertBody: UpsertAbilityStatBodySchema,
    batchUpsertBody: BatchUpsertAbilityStatsBodySchema,
    resource: AbilityStatSchema,
    upsertedResponse: UpsertResponseSchema,
    batchUpsertedResponse: BatchUpsertResponseSchema,
  },
  controllers: abilityStatsController,
});
