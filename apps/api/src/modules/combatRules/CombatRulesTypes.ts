import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema } from "../../shared/services/query";

/**
 * As constantes de combate. Recurso singleton — sem `code`, sem lista, sem
 * POST. `GET /combat-rules` devolve a linha; `PATCH /combat-rules` ajusta.
 */
export const CombatRuleSchema = z
  .object({
    id: z.number().int(),
    damageConstant: z.number(),
    damageVarianceMin: z.number(),
    damageVarianceMax: z.number(),
    damageMinimum: z.number().int(),
    chargeMax: z.number().int(),
    chargeTakenMultiplier: z.number(),
    chargeDealtMultiplier: z.number(),
    chargeNeutralCharge: z.number().int(),
    captureMinChance: z.number(),
    captureMaxChance: z.number(),
    levelMin: z.number().int(),
    levelMax: z.number().int(),
    elementNeutralMultiplier: z.number(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("CombatRule");

/**
 * Todo campo é opcional: ajustar uma constante não deve exigir reenviar as
 * outras treze. Os limites espelham os CHECK do banco, para o erro chegar
 * com o nome do campo em vez de virar uma violação de constraint crua.
 */
const coreSchema = z.object({
  damageConstant: z.number().gt(0).max(2).optional().openapi({
    description: "Escala global do dano. Menor deixa as lutas mais longas.",
    example: 0.22,
  }),
  damageVarianceMin: z.number().gt(0).max(2).optional().openapi({ example: 0.9 }),
  damageVarianceMax: z.number().gt(0).max(2).optional().openapi({ example: 1.1 }),
  damageMinimum: z.number().int().min(0).max(100).optional().openapi({ example: 1 }),

  chargeMax: z.number().int().gt(0).max(1000).optional().openapi({ example: 100 }),
  chargeTakenMultiplier: z.number().min(0).max(20).optional().openapi({
    description: "Peso do dano sofrido no enchimento do Despertar.",
    example: 3.0,
  }),
  chargeDealtMultiplier: z.number().min(0).max(20).optional().openapi({
    description: "Peso do dano causado. Mantenha abaixo do de sofrer.",
    example: 1.5,
  }),
  chargeNeutralCharge: z.number().int().gt(0).max(999).optional().openapi({ example: 50 }),

  captureMinChance: z.number().min(0).max(1).optional().openapi({ example: 0.01 }),
  captureMaxChance: z.number().min(0).max(1).optional().openapi({ example: 0.95 }),

  levelMin: z.number().int().min(1).max(999).optional().openapi({ example: 1 }),
  levelMax: z.number().int().min(1).max(999).optional().openapi({ example: 50 }),

  elementNeutralMultiplier: z.number().gt(0).max(10).optional().openapi({ example: 1.0 }),
  notes: z.string().max(500).nullish(),
});

export const UpdateCombatRulesBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpdateCombatRulesBody");

export const UpdatedResponseSchema = z
  .object({ version: z.string() })
  .openapi("UpdateCombatRulesResponse");

/** Campos que um PATCH pode escrever. */
export const COMBAT_RULE_PAYLOAD = [
  "damageConstant", "damageVarianceMin", "damageVarianceMax", "damageMinimum",
  "chargeMax", "chargeTakenMultiplier", "chargeDealtMultiplier", "chargeNeutralCharge",
  "captureMinChance", "captureMaxChance", "levelMin", "levelMax",
  "elementNeutralMultiplier", "notes",
] as const;

export type UpdateCombatRulesBody = z.infer<typeof UpdateCombatRulesBodySchema>;
