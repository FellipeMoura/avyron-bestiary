import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

/**
 * The five stats a class may specialise in.
 *
 * Deliberately the same five keys the game already uses (`creature_stats`
 * minus the `base` prefix, and exactly what `stats_at_level` returns). The
 * player-facing labels differ — `speed` shows as "Velocidade de Ataque",
 * `charge` as "Stamina" — and that split is the normal one here: enum in
 * English, label in Portuguese. Inventing `attackSpeed`/`stamina` tokens
 * would have meant a translation table between the class and the stat it
 * modifies.
 */
export const PRIMARY_STATS = ["hp", "attack", "defense", "speed", "charge"] as const;

const primaryStatSchema = z.enum(PRIMARY_STATS, {
  errorMap: () => ({
    message: `primaryStat must be one of: ${PRIMARY_STATS.join(", ")}`,
  }),
});

export const CreatureClassSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "CLS-001" }),
    name: z.string(),
    primaryStat: primaryStatSchema.nullable(),
    primaryStatBonusPct: z.number(),
    description: z.string().nullable(),
    passive: z.string().nullable(),
    workFunction: z.string().nullable(),
    fusionRule: z.string().nullable(),
    status: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("CreatureClass", {
    description:
      "Gameplay specialisation, NOT a biological lineage — taxonomy is independent of class "
      + "since 2026-08. Each class boosts exactly one stat (`primaryStat`) by "
      + "`primaryStatBonusPct`. There is still no CLS×CLS advantage matrix: no value here ever "
      + "depends on the opposing class.",
  });

export const CREATURE_CLASS_FIELDS = [
  "id",
  "code",
  "name",
  "primaryStat",
  "primaryStatBonusPct",
  "description",
  "passive",
  "workFunction",
  "fusionRule",
  "status",
  "createdAt",
  "updatedAt",
] as const;

export const ListCreatureClassesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
});

export const CodeParamsSchema = z.object({
  code: z.string().openapi({ example: "CLS-001" }),
});

const coreSchema = z.object({
  code: z.string().min(3).max(16),
  name: z.string().min(1).max(64),
  primaryStat: primaryStatSchema.openapi({ example: "defense" }),
  /**
   * Percentage points, not a multiplier: `20` is +20%. Same convention as
   * `relic_rules.sameClassBonusPct`. Zero is legal (a class deliberately
   * tuned flat); negative is not.
   */
  primaryStatBonusPct: z
    .number()
    .min(0, { message: "primaryStatBonusPct must be >= 0 (percentage points, 20 means +20%)" })
    .openapi({ example: 20 }),
  description: z
    .string()
    .min(1, { message: "description must not be empty" })
    .max(500)
    .openapi({ example: "Especialistas em Defesa. Criaturas resistentes…" }),
  passive: z.string().max(500).nullish(),
  workFunction: z.string().max(500).nullish(),
  fusionRule: z.string().max(500).nullish(),
  status: z.string().max(32).nullish(),
});

// See ElementsTypes for the rationale on making `code` optional only for
// single-create (the factory auto-generates `CLS-NNN`).
export const CreateCreatureClassBodySchema = coreSchema
  .extend({ code: coreSchema.shape.code.optional() })
  .merge(changeMetadataSchema)
  .openapi("CreateCreatureClassBody");

export const UpdateCreatureClassBodySchema = coreSchema
  .partial()
  .merge(changeMetadataSchema)
  .openapi("UpdateCreatureClassBody");

export const BatchCreateCreatureClassesBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(100),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchCreateCreatureClassesBody");

export const CreatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("CreatedResponse");
export const UpdatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpdatedResponse");
export const BatchCreatedResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchCreatedResponse");

export const DeleteCreatureClassBodySchema = changeMetadataSchema.openapi(
  "DeleteCreatureClassBody",
);

export type CreateCreatureClassBody = z.infer<typeof CreateCreatureClassBodySchema>;
export type UpdateCreatureClassBody = z.infer<typeof UpdateCreatureClassBodySchema>;
export type BatchCreateCreatureClassesBody = z.infer<typeof BatchCreateCreatureClassesBodySchema>;
export type DeleteCreatureClassBody = z.infer<typeof DeleteCreatureClassBodySchema>;
