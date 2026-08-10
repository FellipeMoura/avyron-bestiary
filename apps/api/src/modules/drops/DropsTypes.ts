import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const DropSchema = z
  .object({
    id: z.number().int(),
    creatureId: z.number().int(),
    itemId: z.number().int(),
    chance: z.number().min(0).max(1),
    condition: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Drop");

export const DROP_FIELDS = [
  "id", "creatureId", "itemId", "chance", "condition", "createdAt", "updatedAt",
] as const;

export const ListDropsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  creatureCode: z.string().optional(),
  itemCode: z.string().optional(),
});

const coreSchema = z.object({
  creatureCode: z.string().openapi({ example: "CRT-001" }),
  itemCode: z.string().openapi({ example: "ITM-001" }),
  chance: z.number().min(0).max(1).openapi({ example: 0.15 }),
  condition: z.string().max(128).nullish().openapi({ example: "Qualquer derrota" }),
});

/**
 * Upsert semantics: the natural key is (creatureCode, itemCode, condition).
 * A second POST with the same triple updates `chance`. No PATCH/DELETE — the
 * agent expresses "the chance changed" by POSTing again.
 */
export const UpsertDropBodySchema = coreSchema.merge(changeMetadataSchema).openapi("UpsertDropBody");
export const BatchUpsertDropsBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchUpsertDropsBody");

export const UpsertResponseSchema = z
  .object({ id: z.number().int(), version: z.string() })
  .openapi("UpsertDropResponse");
export const BatchUpsertResponseSchema = z
  .object({ ids: z.array(z.number().int()), version: z.string() })
  .openapi("BatchUpsertDropsResponse");

export type UpsertDropBody = z.infer<typeof UpsertDropBodySchema>;
export type BatchUpsertDropsBody = z.infer<typeof BatchUpsertDropsBodySchema>;
