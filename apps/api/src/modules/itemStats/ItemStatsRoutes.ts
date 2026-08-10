import { registerChildUpsertRoutes } from "../../shared/services/childUpsertRoutes";
import { itemStatsController } from "./ItemStatsController";
import {
  BatchUpsertItemStatsBodySchema,
  BatchUpsertResponseSchema,
  ItemCodeParamsSchema,
  ItemStatSchema,
  ListItemStatsQuerySchema,
  UpsertItemStatBodySchema,
  UpsertResponseSchema,
} from "./ItemStatsTypes";

export const itemStatsRouter = registerChildUpsertRoutes({
  basePath: "/item-stats",
  tag: "item-stats",
  parentNoun: "item",
  schemas: {
    listQuery: ListItemStatsQuerySchema,
    codeParams: ItemCodeParamsSchema,
    upsertBody: UpsertItemStatBodySchema,
    batchUpsertBody: BatchUpsertItemStatsBodySchema,
    resource: ItemStatSchema,
    upsertedResponse: UpsertResponseSchema,
    batchUpsertedResponse: BatchUpsertResponseSchema,
  },
  controllers: itemStatsController,
});
