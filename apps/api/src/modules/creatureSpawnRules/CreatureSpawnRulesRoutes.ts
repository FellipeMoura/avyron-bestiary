import { registerChildUpsertRoutes } from "../../shared/services/childUpsertRoutes";
import { creatureSpawnRulesController } from "./CreatureSpawnRulesController";
import {
  BatchUpsertCreatureSpawnRulesBodySchema,
  BatchUpsertResponseSchema,
  CreatureCodeParamsSchema,
  CreatureSpawnRuleSchema,
  ListCreatureSpawnRulesQuerySchema,
  UpsertCreatureSpawnRuleBodySchema,
  UpsertResponseSchema,
} from "./CreatureSpawnRulesTypes";

export const creatureSpawnRulesRouter = registerChildUpsertRoutes({
  basePath: "/creature-spawn-rules",
  tag: "creature-spawn-rules",
  parentNoun: "creature",
  schemas: {
    listQuery: ListCreatureSpawnRulesQuerySchema,
    codeParams: CreatureCodeParamsSchema,
    upsertBody: UpsertCreatureSpawnRuleBodySchema,
    batchUpsertBody: BatchUpsertCreatureSpawnRulesBodySchema,
    resource: CreatureSpawnRuleSchema,
    upsertedResponse: UpsertResponseSchema,
    batchUpsertedResponse: BatchUpsertResponseSchema,
  },
  controllers: creatureSpawnRulesController,
});
