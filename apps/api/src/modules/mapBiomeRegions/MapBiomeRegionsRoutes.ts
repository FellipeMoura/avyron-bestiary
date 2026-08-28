import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { mapBiomeRegionsController } from "./MapBiomeRegionsController";
import {
  BatchCreateMapBiomeRegionsBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateMapBiomeRegionBodySchema,
  CreatedResponseSchema,
  DeleteMapBiomeRegionBodySchema,
  ListMapBiomeRegionsQuerySchema,
  MapBiomeRegionSchema,
  UpdateMapBiomeRegionBodySchema,
  UpdatedResponseSchema,
} from "./MapBiomeRegionsTypes";

/**
 * Full CRUD, DELETE included — unlike the junctions. A region is an entity
 * with its own code (a biome may occupy several disjoint regions of the same
 * map, so the map+biome pair does not identify a row), and taking one off the
 * map has to be possible without deleting the biome from it.
 */
export const mapBiomeRegionsRouter = registerCrudRoutes({
  basePath: "/map-biome-regions",
  tag: "map-biome-regions",
  controllers: mapBiomeRegionsController,
  schemas: {
    listQuery: ListMapBiomeRegionsQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateMapBiomeRegionBodySchema,
    updateBody: UpdateMapBiomeRegionBodySchema,
    batchCreateBody: BatchCreateMapBiomeRegionsBodySchema,
    resource: MapBiomeRegionSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
    deleteBody: DeleteMapBiomeRegionBodySchema,
  },
});
