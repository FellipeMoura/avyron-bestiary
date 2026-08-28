import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const GlyphSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "GLF-001" }),
    name: z.string().openapi({ example: "Daleth" }),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Glyph");

export const GLYPH_FIELDS = [
  "id", "code", "name", "notes", "createdAt", "updatedAt",
] as const;

export const ListGlyphsQuerySchema = paginationSchema.extend({ fields: z.string().optional() });
export const CodeParamsSchema = z.object({ code: z.string().openapi({ example: "GLF-001" }) });

const coreSchema = z.object({
  code: z.string().min(3).max(16),
  /** A letter of the reference alphabet — "Daleth", not "Glifo Daleth". */
  name: z.string().min(1).max(64),
  notes: z.string().max(2000).nullish(),
});

// `code` optional on single-create — factory auto-generates `GLF-NNN`.
export const CreateGlyphBodySchema = coreSchema
  .extend({ code: coreSchema.shape.code.optional() })
  .merge(changeMetadataSchema)
  .openapi("CreateGlyphBody");
export const UpdateGlyphBodySchema = coreSchema.partial().merge(changeMetadataSchema).openapi("UpdateGlyphBody");
export const BatchCreateGlyphsBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchCreateGlyphsBody");

export const CreatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("CreatedGlyphResponse");
export const UpdatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("UpdatedGlyphResponse");
export const BatchCreatedResponseSchema = z.object({ codes: z.array(z.string()), version: z.string() }).openapi("BatchCreatedGlyphsResponse");
export const DeleteGlyphBodySchema = changeMetadataSchema.openapi("DeleteGlyphBody");

export type CreateGlyphBody = z.infer<typeof CreateGlyphBodySchema>;
export type UpdateGlyphBody = z.infer<typeof UpdateGlyphBodySchema>;
export type BatchCreateGlyphsBody = z.infer<typeof BatchCreateGlyphsBodySchema>;
export type DeleteGlyphBody = z.infer<typeof DeleteGlyphBodySchema>;
