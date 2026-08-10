import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

/**
 * O que o Godot executa ao usar um item. Mesmo contrato que `ability_effect`
 * tem com o sistema de batalha — `items.effect` segue sendo prosa para
 * humano, isto é o switch.
 *
 * `effectValue` muda de unidade conforme o código, e é de propósito: um campo
 * só evita uma tabela de colunas quase sempre nulas.
 */
export const ITEM_EFFECTS = ["none", "capture_bonus", "heal_flat", "heal_percent"] as const;

export const ItemStatSchema = z
  .object({
    id: z.number().int(),
    itemId: z.number().int(),
    value: z.number().int(),
    effectCode: z.enum(ITEM_EFFECTS),
    effectValue: z.number(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("ItemStat");

export const ITEM_STAT_FIELDS = [
  "id", "itemId", "value", "effectCode", "effectValue", "notes", "createdAt", "updatedAt",
] as const;

export const ITEM_STAT_PAYLOAD = ["value", "effectCode", "effectValue", "notes"] as const;

export const ListItemStatsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  itemCode: z.string().optional(),
});

export const ItemCodeParamsSchema = z.object({
  code: z.string().openapi({ example: "ITM-001" }),
});

const coreSchema = z.object({
  itemCode: z.string().openapi({ example: "ITM-001" }),
  value: z.number().int().min(0).max(1000000).optional().openapi({
    description:
      "Preço de compra, na moeda de economy_rules. O de venda sai daqui multiplicado pelo sellRatio.",
    example: 12,
  }),
  effectCode: z.enum(ITEM_EFFECTS).optional().openapi({
    description: "none para mercadoria pura (todo mineral).",
    example: "none",
  }),
  effectValue: z.number().min(0).max(1000).optional().openapi({
    description:
      "Multiplicador da chance em capture_bonus; pontos de HP em heal_flat; " +
      "porcentagem do HP máximo em heal_percent. Ignorado em none.",
    example: 0,
  }),
  notes: z.string().max(2000).nullish(),
});

export const UpsertItemStatBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertItemStatBody");

export const BatchUpsertItemStatsBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertItemStatsBody");

export const UpsertResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpsertItemStatResponse");
export const BatchUpsertResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchUpsertItemStatsResponse");

export type UpsertItemStatBody = z.infer<typeof UpsertItemStatBodySchema>;
export type BatchUpsertItemStatsBody = z.infer<typeof BatchUpsertItemStatsBodySchema>;
