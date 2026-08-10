import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema } from "../../shared/services/query";

/**
 * As constantes globais do sistema de Relicário. Recurso singleton — sem
 * `code`, sem lista, sem POST. `GET /relic-rules` devolve a linha;
 * `PATCH /relic-rules` ajusta.
 */
export const RelicRuleSchema = z
  .object({
    id: z.number().int(),
    captureFloorPct: z.number(),
    captureCeilPct: z.number(),
    sameElementBonusPct: z.number(),
    sameClassBonusPct: z.number(),
    elementDisadvantagePenaltyPct: z.number(),
    xpPerCapture: z.number().int(),
    xpCurveBase: z.number(),
    xpCurveExponent: z.number(),
    materialCostBase: z.number().int(),
    materialCostLevelStep: z.number().int(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("RelicRule");

const coreSchema = z.object({
  captureFloorPct: z.number().min(0).max(100).optional().openapi({
    description: "Piso de final% na fórmula de captura do relicário.",
    example: 5,
  }),
  captureCeilPct: z.number().min(0).max(100).optional().openapi({ example: 95 }),
  sameElementBonusPct: z.number().min(0).max(100).optional().openapi({
    description: "Somado a base% quando o elemento do relicário bate com o da criatura.",
    example: 15,
  }),
  sameClassBonusPct: z.number().min(0).max(100).optional().openapi({
    description: "Somado a base% quando a classe do relicário bate com a da criatura.",
    example: 10,
  }),
  elementDisadvantagePenaltyPct: z.number().min(0).max(100).optional().openapi({
    description:
      "Subtraído de base% quando o elemento do relicário está em desvantagem contra o da criatura (via /elemental-advantages). Armazenado positivo.",
    example: 15,
  }),
  xpPerCapture: z.number().int().gt(0).max(1000).optional().openapi({
    description: "Placeholder — XP fixo ganho por captura bem-sucedida, não-final.",
    example: 20,
  }),
  xpCurveBase: z.number().gt(0).max(1000).optional().openapi({ example: 10 }),
  xpCurveExponent: z.number().min(1).max(4).optional().openapi({ example: 1.5 }),
  materialCostBase: z.number().int().min(0).max(100).optional().openapi({
    description: "Unidades do material de classe exigidas já no nível 1 do relicário.",
    example: 1,
  }),
  materialCostLevelStep: z.number().int().gt(0).max(999).optional().openapi({
    description: "A cada quantos níveis o custo de material sobe uma unidade.",
    example: 20,
  }),
  notes: z.string().max(500).nullish(),
});

export const UpdateRelicRulesBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpdateRelicRulesBody");

export const UpdatedResponseSchema = z
  .object({ version: z.string() })
  .openapi("UpdateRelicRulesResponse");

/** Campos que um PATCH pode escrever. */
export const RELIC_RULE_PAYLOAD = [
  "captureFloorPct",
  "captureCeilPct",
  "sameElementBonusPct",
  "sameClassBonusPct",
  "elementDisadvantagePenaltyPct",
  "xpPerCapture",
  "xpCurveBase",
  "xpCurveExponent",
  "materialCostBase",
  "materialCostLevelStep",
  "notes",
] as const;

export type UpdateRelicRulesBody = z.infer<typeof UpdateRelicRulesBodySchema>;
