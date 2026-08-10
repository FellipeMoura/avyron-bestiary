import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

/**
 * Effect codes are the switch the Godot battle system runs on.
 * `damage` is the plain case (power × element multiplier). Buffs/debuffs use
 * `effectValue` as a percentage; `heal` and `charge_gain` use it as a flat
 * amount out of 100.
 */
export const ABILITY_EFFECTS = [
  "damage",
  "buff_attack",
  "buff_defense",
  "debuff_attack",
  "debuff_defense",
  "heal",
  "charge_gain",
] as const;

export const AbilityStatSchema = z
  .object({
    id: z.number().int(),
    abilityId: z.number().int(),
    power: z.number().int(),
    accuracy: z.number().int(),
    uses: z.number().int(),
    priority: z.number().int(),
    effectCode: z.enum(ABILITY_EFFECTS),
    effectValue: z.number().int(),
    targetSelf: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("AbilityStat");

export const ABILITY_STAT_FIELDS = [
  "id", "abilityId", "power", "accuracy", "uses", "priority",
  "effectCode", "effectValue", "targetSelf", "createdAt", "updatedAt",
] as const;

export const ABILITY_STAT_PAYLOAD = [
  "power", "accuracy", "uses", "priority", "effectCode", "effectValue", "targetSelf",
] as const;

export const ListAbilityStatsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  abilityCode: z.string().optional(),
});

export const AbilityCodeParamsSchema = z.object({
  code: z.string().openapi({ example: "HAB-001" }),
});

const coreSchema = z.object({
  abilityCode: z.string().openapi({ example: "HAB-001" }),
  power: z.number().int().min(0).max(250).optional().openapi({
    description: "0 significa que a habilidade não causa dano direto — é um movimento de status.",
    example: 45,
  }),
  accuracy: z.number().int().min(1).max(100).optional().openapi({ example: 95 }),
  uses: z.number().int().min(1).max(40).optional().openapi({ example: 15 }),
  priority: z.number().int().min(-3).max(3).optional().openapi({
    description: "Maior age primeiro, ignorando velocidade. 0 é normal.",
    example: 0,
  }),
  effectCode: z.enum(ABILITY_EFFECTS).optional().openapi({ example: "damage" }),
  effectValue: z.number().int().min(0).max(100).optional().openapi({ example: 0 }),
  targetSelf: z.boolean().optional().openapi({ example: false }),
});

export const UpsertAbilityStatBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertAbilityStatBody");

export const BatchUpsertAbilityStatsBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertAbilityStatsBody");

export const UpsertResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpsertAbilityStatResponse");
export const BatchUpsertResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchUpsertAbilityStatsResponse");

export type UpsertAbilityStatBody = z.infer<typeof UpsertAbilityStatBodySchema>;
export type BatchUpsertAbilityStatsBody = z.infer<typeof BatchUpsertAbilityStatsBodySchema>;
