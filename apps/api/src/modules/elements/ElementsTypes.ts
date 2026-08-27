import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------

/**
 * `#RRGGBB`, uppercase or lowercase, always six digits.
 *
 * Three-digit shorthand is rejected on purpose: the game parses these with
 * Godot's `Color(String)`, which accepts both, but the editing screen shows
 * them in a native colour input that only round-trips six digits — accepting
 * `#f00` here would silently rewrite itself to `#ff0000` on the next save and
 * make the changelog record an edit nobody made.
 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const hexColor = (example: string) =>
  z.string().regex(HEX_COLOR, "expected #RRGGBB").openapi({ example });

// ---------------------------------------------------------------------------
// response shape
// ---------------------------------------------------------------------------

export const ElementSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "ELE-001" }),
    name: z.string().openapi({ example: "Fogo" }),
    notes: z.string().nullable(),
    paletteShadow: z.string().nullable(),
    paletteMid: z.string().nullable(),
    paletteHighlight: z.string().nullable(),
    paletteAura: z.string().nullable(),
    paletteSpread: z.number(),
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
  "paletteShadow",
  "paletteMid",
  "paletteHighlight",
  "paletteAura",
  "paletteSpread",
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
  paletteShadow: hexColor("#3B0F0A").nullish(),
  paletteMid: hexColor("#C6552F").nullish(),
  paletteHighlight: hexColor("#FFC66B").nullish(),
  paletteAura: hexColor("#FF8A3D").nullish(),
  // Upper bound is 0.5 and not 1.0: the bias is applied to a 0..1 ramp
  // position, so a spread past half the ramp lets one creature of the family
  // land on the shadow stop while another lands on the highlight — which is
  // exactly the "two creatures of the same element look unrelated" outcome
  // the ramp exists to prevent.
  paletteSpread: z.number().min(0).max(0.5).optional().openapi({ example: 0.18 }),
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
