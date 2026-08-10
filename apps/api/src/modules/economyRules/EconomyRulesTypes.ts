import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema } from "../../shared/services/query";

/**
 * As constantes da economia. Recurso singleton, como `combat-rules` — sem
 * `code`, sem lista, sem POST. `GET` devolve a linha, `PATCH` ajusta.
 */
export const EconomyRuleSchema = z
  .object({
    id: z.number().int(),
    currencyName: z.string(),
    currencyNamePlural: z.string(),
    startingCurrency: z.number().int(),
    sellRatio: z.number(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("EconomyRule");

const coreSchema = z.object({
  currencyName: z.string().min(1).max(32).optional().openapi({
    description: "Nome da moeda, no singular. Fica no banco porque renomear moeda é conteúdo.",
    example: "Óbolo",
  }),
  currencyNamePlural: z.string().min(1).max(32).optional().openapi({ example: "Óbolos" }),
  startingCurrency: z.number().int().min(0).max(1000000).optional().openapi({ example: 120 }),
  sellRatio: z.number().gt(0).lt(1).optional().openapi({
    description:
      "Fração do value que o comerciante paga ao comprar do jogador. Em 1.0 o jogador " +
      "lucraria comprando e revendendo em loop, então o banco recusa.",
    example: 0.4,
  }),
  notes: z.string().max(500).nullish(),
});

export const UpdateEconomyRulesBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpdateEconomyRulesBody");

export const UpdatedResponseSchema = z
  .object({ version: z.string() })
  .openapi("UpdateEconomyRulesResponse");

/** Campos que um PATCH pode escrever. */
export const ECONOMY_RULE_PAYLOAD = [
  "currencyName", "currencyNamePlural", "startingCurrency", "sellRatio", "notes",
] as const;

export type UpdateEconomyRulesBody = z.infer<typeof UpdateEconomyRulesBodySchema>;
