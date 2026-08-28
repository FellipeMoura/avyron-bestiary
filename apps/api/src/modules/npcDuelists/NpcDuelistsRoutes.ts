import { registerChildUpsertRoutes } from "../../shared/services/childUpsertRoutes";
import { npcDuelistsController } from "./NpcDuelistsController";
import {
  BatchUpsertNpcDuelistsBodySchema,
  BatchUpsertResponseSchema,
  ListNpcDuelistsQuerySchema,
  NpcCodeParamsSchema,
  NpcDuelistSchema,
  UpsertNpcDuelistBodySchema,
  UpsertResponseSchema,
} from "./NpcDuelistsTypes";

export const npcDuelistsRouter = registerChildUpsertRoutes({
  basePath: "/npc-duelists",
  tag: "npc-duelists",
  parentNoun: "npc",
  schemas: {
    listQuery: ListNpcDuelistsQuerySchema,
    codeParams: NpcCodeParamsSchema,
    upsertBody: UpsertNpcDuelistBodySchema,
    batchUpsertBody: BatchUpsertNpcDuelistsBodySchema,
    resource: NpcDuelistSchema,
    upsertedResponse: UpsertResponseSchema,
    batchUpsertedResponse: BatchUpsertResponseSchema,
  },
  controllers: npcDuelistsController,
});
