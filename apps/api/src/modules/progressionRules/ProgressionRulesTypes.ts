import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema } from "../../shared/services/query";

/**
 * As constantes da progressão de nível. Recurso singleton — sem `code`, sem
 * lista, sem POST. `GET /progression-rules` devolve a linha;
 * `PATCH /progression-rules` ajusta.
 */
export const ProgressionRuleSchema = z
  .object({
    id: z.number().int(),
    xpCurveBase: z.number(),
    xpCurveExponent: z.number(),
    xpYieldDivisor: z.number(),
    itemCostBase: z.number().int(),
    itemCostLevelStep: z.number().int(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("ProgressionRule");

/**
 * Todo campo é opcional — ajustar uma constante não deve exigir reenviar as
 * outras. Os limites espelham os CHECK do banco, para o erro chegar nomeando
 * o campo em vez de virar violação de constraint crua.
 */
const coreSchema = z.object({
  xpCurveBase: z.number().gt(0).max(1000).optional().openapi({
    description: "Escala da curva: xpToNext(nível) = floor(xpCurveBase * nível ^ xpCurveExponent).",
    example: 14,
  }),
  xpCurveExponent: z.number().min(1).max(4).optional().openapi({
    description: "Inclinação da curva. 1.0 é linear; acima disso o fim da subida pesa mais.",
    example: 1.7,
  }),
  xpYieldDivisor: z.number().gt(0).max(100).optional().openapi({
    description: "Divisor do XP concedido por derrota. Maior deixa a subida mais lenta.",
    example: 5,
  }),
  itemCostBase: z.number().int().min(0).max(100).optional().openapi({
    description: "Unidades de material exigidas já no primeiro nível.",
    example: 1,
  }),
  itemCostLevelStep: z.number().int().gt(0).max(999).optional().openapi({
    description: "A cada quantos níveis o custo de material sobe em uma unidade.",
    example: 20,
  }),
  notes: z.string().max(500).nullish(),
});

export const UpdateProgressionRulesBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpdateProgressionRulesBody");

export const UpdatedResponseSchema = z
  .object({ version: z.string() })
  .openapi("UpdateProgressionRulesResponse");

/** Campos que um PATCH pode escrever. */
export const PROGRESSION_RULE_PAYLOAD = [
  "xpCurveBase",
  "xpCurveExponent",
  "xpYieldDivisor",
  "itemCostBase",
  "itemCostLevelStep",
  "notes",
] as const;

export type UpdateProgressionRulesBody = z.infer<typeof UpdateProgressionRulesBodySchema>;
