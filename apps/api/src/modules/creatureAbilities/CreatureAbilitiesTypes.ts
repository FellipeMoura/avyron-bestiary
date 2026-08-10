import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const CreatureAbilitySchema = z
  .object({
    id: z.number().int(),
    creatureId: z.number().int(),
    abilityId: z.number().int(),
    learnLevel: z.number().int(),
    sortOrder: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("CreatureAbility");

export const CREATURE_ABILITY_FIELDS = [
  "id", "creatureId", "abilityId", "learnLevel", "sortOrder", "createdAt", "updatedAt",
] as const;

export const ListCreatureAbilitiesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  creatureCode: z.string().optional(),
  abilityCode: z.string().optional(),
});

const coreSchema = z.object({
  creatureCode: z.string().openapi({ example: "CRT-001" }),
  abilityCode: z.string().openapi({ example: "HAB-001" }),
  learnLevel: z.number().int().min(1).max(100).optional().openapi({
    description: "Nível em que a criatura aprende a habilidade. 1 = já começa com ela.",
    example: 1,
  }),
  sortOrder: z.number().int().min(0).max(99).optional().openapi({ example: 0 }),
});

/**
 * Upsert semantics on (creatureCode, abilityCode), matching `drops` and
 * `map-biomes`. Re-POSTing the same pair changes `learnLevel`/`sortOrder`.
 */
export const UpsertCreatureAbilityBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertCreatureAbilityBody");

export const BatchUpsertCreatureAbilitiesBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(300),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertCreatureAbilitiesBody");

export const UpsertResponseSchema = z
  .object({ id: z.number().int(), version: z.string() })
  .openapi("UpsertCreatureAbilityResponse");
export const BatchUpsertResponseSchema = z
  .object({ ids: z.array(z.number().int()), version: z.string() })
  .openapi("BatchUpsertCreatureAbilitiesResponse");

export type UpsertCreatureAbilityBody = z.infer<typeof UpsertCreatureAbilityBodySchema>;
export type BatchUpsertCreatureAbilitiesBody = z.infer<
  typeof BatchUpsertCreatureAbilitiesBodySchema
>;
