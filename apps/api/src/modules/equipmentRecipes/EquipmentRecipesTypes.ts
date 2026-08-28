import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const EquipmentRecipeSchema = z
  .object({
    id: z.number().int(),
    equipmentId: z.number().int(),
    itemId: z.number().int(),
    quantity: z.number().int(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("EquipmentRecipe");

export const EQUIPMENT_RECIPE_FIELDS = [
  "id",
  "equipmentId",
  "itemId",
  "quantity",
  "notes",
  "createdAt",
  "updatedAt",
] as const;

export const ListEquipmentRecipesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  equipmentCode: z.string().optional(),
  itemCode: z.string().optional(),
});

const coreSchema = z.object({
  equipmentCode: z.string().openapi({ example: "EQP-001" }),
  itemCode: z.string().openapi({ example: "ITM-004" }),
  quantity: z.number().int().min(1).max(999).openapi({
    description: "Units of this item consumed by one craft.",
    example: 6,
  }),
  notes: z.string().max(500).nullish(),
});

export const UpsertEquipmentRecipeBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertEquipmentRecipeBody");

export const BatchUpsertEquipmentRecipesBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertEquipmentRecipesBody");

/**
 * DELETE takes the natural key in the body, same as `/drops`. It exists for
 * the one thing upsert cannot say — that an ingredient should stop being part
 * of a recipe. `quantity: 0` is not that: the check constraint rejects it,
 * deliberately, so nobody can express "zero of this" and leave a row the
 * export still reads as an ingredient.
 */
export const DeleteEquipmentRecipeBodySchema = z
  .object({
    equipmentCode: z.string().openapi({ example: "EQP-001" }),
    itemCode: z.string().openapi({ example: "ITM-004" }),
  })
  .merge(changeMetadataSchema)
  .openapi("DeleteEquipmentRecipeBody");

export const UpsertResponseSchema = z
  .object({ id: z.number().int(), version: z.string() })
  .openapi("UpsertEquipmentRecipeResponse");
export const BatchUpsertResponseSchema = z
  .object({ ids: z.array(z.number().int()), version: z.string() })
  .openapi("BatchUpsertEquipmentRecipesResponse");
export const DeletedResponseSchema = z
  .object({ id: z.number().int(), version: z.string() })
  .openapi("DeletedEquipmentRecipeResponse");

export type UpsertEquipmentRecipeBody = z.infer<typeof UpsertEquipmentRecipeBodySchema>;
export type BatchUpsertEquipmentRecipesBody = z.infer<typeof BatchUpsertEquipmentRecipesBodySchema>;
export type DeleteEquipmentRecipeBody = z.infer<typeof DeleteEquipmentRecipeBodySchema>;
