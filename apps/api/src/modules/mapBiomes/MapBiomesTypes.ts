import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const MapBiomeSchema = z
  .object({
    id: z.number().int(),
    mapId: z.number().int(),
    biomeId: z.number().int(),
    sortOrder: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("MapBiome");

export const MAP_BIOME_FIELDS = [
  "id", "mapId", "biomeId", "sortOrder", "createdAt", "updatedAt",
] as const;

export const ListMapBiomesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  mapCode: z.string().optional(),
  biomeCode: z.string().optional(),
});

const coreSchema = z.object({
  mapCode: z.string().openapi({ example: "PZ-01" }),
  biomeCode: z.string().openapi({ example: "BIO-001" }),
  sortOrder: z.number().int().min(0).default(0),
});

export const UpsertMapBiomeBodySchema = coreSchema.merge(changeMetadataSchema).openapi("UpsertMapBiomeBody");
export const BatchUpsertMapBiomesBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchUpsertMapBiomesBody");

export const UpsertResponseSchema = z.object({ id: z.number().int(), version: z.string() }).openapi("UpsertMapBiomeResponse");
export const BatchUpsertResponseSchema = z.object({ ids: z.array(z.number().int()), version: z.string() }).openapi("BatchUpsertMapBiomesResponse");

export type UpsertMapBiomeBody = z.infer<typeof UpsertMapBiomeBodySchema>;
export type BatchUpsertMapBiomesBody = z.infer<typeof BatchUpsertMapBiomesBodySchema>;
