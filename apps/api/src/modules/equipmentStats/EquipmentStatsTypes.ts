import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const EQUIPMENT_EFFECTS = [
  "buff_attack",
  "buff_defense",
  "debuff_attack",
  "debuff_defense",
] as const;

export const EquipmentStatSchema = z
  .object({
    id: z.number().int(),
    equipmentId: z.number().int(),
    tier: z.number().int(),
    effectCode: z.enum(EQUIPMENT_EFFECTS),
    effectValue: z.number().int(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("EquipmentStat");

export const EQUIPMENT_STAT_FIELDS = [
  "id",
  "equipmentId",
  "tier",
  "effectCode",
  "effectValue",
  "notes",
  "createdAt",
  "updatedAt",
] as const;

export const EQUIPMENT_STAT_PAYLOAD = ["tier", "effectCode", "effectValue", "notes"] as const;

export const ListEquipmentStatsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  equipmentCode: z.string().optional(),
});

export const EquipmentCodeParamsSchema = z.object({
  code: z.string().openapi({ example: "EQP-001" }),
});

const coreSchema = z.object({
  equipmentCode: z.string().openapi({ example: "EQP-001" }),
  tier: z.number().int().min(1).max(9).openapi({
    description:
      "Rank inside the slot. Ordering and naming only — no formula reads it. Strength is effectValue.",
    example: 1,
  }),
  effectCode: z.enum(EQUIPMENT_EFFECTS).openapi({
    description:
      "Which stat the modifier moves. WHO it lands on comes from equipment.slot, not from here.",
    example: "buff_attack",
  }),
  effectValue: z.number().int().min(1).max(100).openapi({
    description:
      "Percentage points, never a fraction — 10 means +10%. Same unit ability_stats uses for these "
      + "same four codes. The game applies it as modifier *= 1 ± value/100.",
    example: 5,
  }),
  notes: z.string().max(500).nullish(),
});

export const UpsertEquipmentStatBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertEquipmentStatBody");

export const BatchUpsertEquipmentStatsBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertEquipmentStatsBody");

export const UpsertResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpsertEquipmentStatResponse");
export const BatchUpsertResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchUpsertEquipmentStatsResponse");

export type UpsertEquipmentStatBody = z.infer<typeof UpsertEquipmentStatBodySchema>;
export type BatchUpsertEquipmentStatsBody = z.infer<typeof BatchUpsertEquipmentStatsBodySchema>;
