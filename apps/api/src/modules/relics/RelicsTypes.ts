import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

// ---------------------------------------------------------------------------
// response
// ---------------------------------------------------------------------------

export const RelicSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "RLC-001" }),
    name: z.string(),
    elementId: z.number().int().nullable(),
    classId: z.number().int().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Relic");

export const RELIC_FIELDS = [
  "id",
  "code",
  "name",
  "elementId",
  "classId",
  "notes",
  "createdAt",
  "updatedAt",
] as const;

// ---------------------------------------------------------------------------
// list query
// ---------------------------------------------------------------------------

export const ListRelicsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  classCode: z.string().optional().openapi({ description: "Filter by creature class code (ex: CLS-001)" }),
  elementCode: z.string().optional().openapi({ description: "Filter by element code (ex: ELE-002)" }),
});

// ---------------------------------------------------------------------------
// path params
// ---------------------------------------------------------------------------

export const CodeParamsSchema = z.object({
  code: z.string().openapi({ example: "RLC-001" }),
});

// ---------------------------------------------------------------------------
// create / update — FKs by CODE, resolved server-side. Element and class are
// fixed for the model's lifetime (design decision — see `relicario` document),
// so unlike most FK fields they are NOT expected to be repatched later; PATCH
// still allows it for a genuine data fix.
//
// Both are nullish: a neutral relic (no elemental/class affinity — the
// player's starter model) omits one or both. Same "absence = no affinity"
// contract `abilities.elementCode` already uses, not a required-then-relaxed
// field.
// ---------------------------------------------------------------------------

const relicCoreSchema = z.object({
  code: z.string().min(3).max(16).openapi({ example: "RLC-001" }),
  name: z.string().min(1).max(128).openapi({ example: "Relicário de Água — Loricati" }),
  elementCode: z.string().nullish().openapi({
    example: "ELE-002",
    description:
      "Reference by element code — resolved server-side to elementId. Fixed per model. Null/absent = no elemental affinity.",
  }),
  classCode: z.string().nullish().openapi({
    example: "CLS-001",
    description:
      "Reference by class code — resolved server-side to classId. Fixed per model. Null/absent = no class affinity.",
  }),
  notes: z.string().max(2000).nullish(),
});

export const CreateRelicBodySchema = relicCoreSchema
  .merge(changeMetadataSchema)
  .openapi("CreateRelicBody");

export const UpdateRelicBodySchema = relicCoreSchema
  .partial()
  .merge(changeMetadataSchema)
  .openapi("UpdateRelicBody");

export const BatchCreateRelicsBodySchema = z
  .object({
    items: z.array(relicCoreSchema).min(1).max(100),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchCreateRelicsBody");

// ---------------------------------------------------------------------------
// write response envelopes
// ---------------------------------------------------------------------------

export const CreatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("CreatedRelicResponse");

export const UpdatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpdatedRelicResponse");

export const BatchCreatedResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchCreatedRelicsResponse");

export type CreateRelicBody = z.infer<typeof CreateRelicBodySchema>;
export type UpdateRelicBody = z.infer<typeof UpdateRelicBodySchema>;
export type BatchCreateRelicsBody = z.infer<typeof BatchCreateRelicsBodySchema>;
