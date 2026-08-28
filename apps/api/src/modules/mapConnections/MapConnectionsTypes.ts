import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const MapConnectionSchema = z
  .object({
    id: z.number().int(),
    fromMapId: z.number().int(),
    toMapId: z.number().int(),
    requiredGlyphId: z.number().int().nullable(),
    sortOrder: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("MapConnection");

export const MAP_CONNECTION_FIELDS = [
  "id", "fromMapId", "toMapId", "requiredGlyphId", "sortOrder", "createdAt", "updatedAt",
] as const;

export const ListMapConnectionsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  fromMapCode: z.string().optional(),
  toMapCode: z.string().optional(),
  glyphCode: z.string().optional(),
});

const coreSchema = z.object({
  fromMapCode: z.string().openapi({ example: "PZ-01" }),
  toMapCode: z.string().openapi({ example: "PZ-02" }),
  /**
   * Omit or send null for free passage — a crossing inside an era. A code
   * here means a guardian demands that Glifo, which is how an era boundary
   * is expressed. Upsert restates the whole row, so omitting it on a re-POST
   * CLEARS a glyph that was there.
   */
  requiredGlyphCode: z.string().nullish().openapi({ example: "GLF-001" }),
  sortOrder: z.number().int().min(0).default(0),
});

export const UpsertMapConnectionBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertMapConnectionBody");
export const BatchUpsertMapConnectionsBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchUpsertMapConnectionsBody");

export const UpsertResponseSchema = z.object({ id: z.number().int(), version: z.string() }).openapi("UpsertMapConnectionResponse");
export const BatchUpsertResponseSchema = z.object({ ids: z.array(z.number().int()), version: z.string() }).openapi("BatchUpsertMapConnectionsResponse");

export type UpsertMapConnectionBody = z.infer<typeof UpsertMapConnectionBodySchema>;
export type BatchUpsertMapConnectionsBody = z.infer<typeof BatchUpsertMapConnectionsBodySchema>;
