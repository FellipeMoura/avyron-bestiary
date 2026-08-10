import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const ElementalAdvantageSchema = z
  .object({
    id: z.number().int(),
    attackerElementId: z.number().int(),
    defenderElementId: z.number().int(),
    multiplier: z.number(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("ElementalAdvantage");

export const ELEMENTAL_ADVANTAGE_FIELDS = [
  "id", "attackerElementId", "defenderElementId", "multiplier", "createdAt", "updatedAt",
] as const;

export const ListElementalAdvantagesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  attackerCode: z.string().optional(),
  defenderCode: z.string().optional(),
});

const coreSchema = z.object({
  attackerCode: z.string().openapi({ example: "ELE-001" }),
  defenderCode: z.string().openapi({ example: "ELE-003" }),
  multiplier: z
    .number()
    .min(0)
    .openapi({ example: 2.0, description: "> 1 = strong; < 1 = weak; symmetry NOT enforced" }),
});

export const UpsertElementalAdvantageBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertElementalAdvantageBody");
export const BatchUpsertElementalAdvantagesBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchUpsertElementalAdvantagesBody");

export const UpsertResponseSchema = z.object({ id: z.number().int(), version: z.string() }).openapi("UpsertElementalAdvantageResponse");
export const BatchUpsertResponseSchema = z.object({ ids: z.array(z.number().int()), version: z.string() }).openapi("BatchUpsertElementalAdvantagesResponse");

export type UpsertElementalAdvantageBody = z.infer<typeof UpsertElementalAdvantageBodySchema>;
export type BatchUpsertElementalAdvantagesBody = z.infer<typeof BatchUpsertElementalAdvantagesBodySchema>;
