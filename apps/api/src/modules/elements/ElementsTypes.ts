import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

// ---------------------------------------------------------------------------
// response shape
// ---------------------------------------------------------------------------

export const ElementSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "ELE-001" }),
    name: z.string().openapi({ example: "Fogo" }),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Element");

export type ElementDto = z.infer<typeof ElementSchema>;

/** Whitelist for `?fields=` — every listable column. */
export const ELEMENT_FIELDS = [
  "id",
  "code",
  "name",
  "notes",
  "createdAt",
  "updatedAt",
] as const;

// ---------------------------------------------------------------------------
// list query
// ---------------------------------------------------------------------------

export const ListElementsQuerySchema = paginationSchema.extend({
  fields: z.string().optional().openapi({
    description: "Comma-separated column subset. Ex: 'code,name'. Omit for all fields.",
  }),
  name: z.string().optional().openapi({ description: "Filter by name (case-insensitive contains)" }),
});

// ---------------------------------------------------------------------------
// path params
// ---------------------------------------------------------------------------

export const CodeParamsSchema = z.object({
  code: z.string().openapi({ example: "ELE-001" }),
});

// ---------------------------------------------------------------------------
// create / update
// ---------------------------------------------------------------------------

/** Element-only fields, used both to build create/update bodies and batch. */
const elementCoreSchema = z.object({
  code: z.string().min(3).max(16).openapi({ example: "ELE-006" }),
  name: z.string().min(1).max(64).openapi({ example: "Sombra" }),
  notes: z.string().max(2000).nullish(),
});

// `code` is optional on single-create: the factory generates the next
// `ELE-NNN` if omitted. Batch keeps `code` required — curated imports
// always know their codes and mixing auto-gen inside a batch complicates
// error reporting for LLM callers.
export const CreateElementBodySchema = elementCoreSchema
  .extend({ code: elementCoreSchema.shape.code.optional() })
  .merge(changeMetadataSchema)
  .openapi("CreateElementBody");

export const UpdateElementBodySchema = elementCoreSchema
  .partial()
  .merge(changeMetadataSchema)
  .openapi("UpdateElementBody");

export const BatchCreateElementsBodySchema = z
  .object({
    items: z.array(elementCoreSchema).min(1).max(100),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchCreateElementsBody");

// ---------------------------------------------------------------------------
// response envelopes for writes (small on purpose — token economy)
// ---------------------------------------------------------------------------

export const CreatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("CreatedResponse");

export const UpdatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpdatedResponse");

export const BatchCreatedResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchCreatedResponse");

export const DeleteElementBodySchema = changeMetadataSchema.openapi("DeleteElementBody");

export type CreateElementBody = z.infer<typeof CreateElementBodySchema>;
export type UpdateElementBody = z.infer<typeof UpdateElementBodySchema>;
export type BatchCreateElementsBody = z.infer<typeof BatchCreateElementsBodySchema>;
export type DeleteElementBody = z.infer<typeof DeleteElementBodySchema>;
