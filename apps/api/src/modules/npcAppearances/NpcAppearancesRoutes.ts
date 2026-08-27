import { registerChildUpsertRoutes } from "../../shared/services/childUpsertRoutes";
import { npcAppearancesController } from "./NpcAppearancesController";
import {
  BatchUpsertNpcAppearancesBodySchema,
  BatchUpsertResponseSchema,
  ListNpcAppearancesQuerySchema,
  NpcAppearanceSchema,
  NpcCodeParamsSchema,
  UpsertNpcAppearanceBodySchema,
  UpsertResponseSchema,
} from "./NpcAppearancesTypes";

export const npcAppearancesRouter = registerChildUpsertRoutes({
  basePath: "/npc-appearances",
  tag: "npc-appearances",
  parentNoun: "npc",
  schemas: {
    listQuery: ListNpcAppearancesQuerySchema,
    codeParams: NpcCodeParamsSchema,
    upsertBody: UpsertNpcAppearanceBodySchema,
    batchUpsertBody: BatchUpsertNpcAppearancesBodySchema,
    resource: NpcAppearanceSchema,
    upsertedResponse: UpsertResponseSchema,
    batchUpsertedResponse: BatchUpsertResponseSchema,
  },
  controllers: npcAppearancesController,
});
