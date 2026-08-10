import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

/**
 * O que um comerciante carrega. Junção npc × item com semântica de upsert,
 * mesmo formato de `drops` e `map-biomes`: re-POST com a mesma chave natural
 * troca o valor, sem PATCH e sem DELETE.
 */
export const MerchantOfferSchema = z
  .object({
    id: z.number().int(),
    npcId: z.number().int(),
    itemId: z.number().int(),
    price: z.number().int().nullable(),
    sortOrder: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("MerchantOffer");

export const MERCHANT_OFFER_FIELDS = [
  "id", "npcId", "itemId", "price", "sortOrder", "createdAt", "updatedAt",
] as const;

export const ListMerchantOffersQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  npcCode: z.string().optional(),
  itemCode: z.string().optional(),
});

const coreSchema = z.object({
  npcCode: z.string().openapi({ example: "NPC-001" }),
  itemCode: z.string().openapi({ example: "ITM-013" }),
  price: z.number().int().min(0).max(1000000).nullish().openapi({
    description:
      "Sobrescreve item_stats.value para este comerciante. null cobra o preço base — " +
      "é o que faz um segundo vilarejo caro custar dado em vez de código.",
    example: null,
  }),
  sortOrder: z.number().int().min(0).max(999).optional().openapi({ example: 0 }),
});

export const UpsertMerchantOfferBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertMerchantOfferBody");

export const BatchUpsertMerchantOffersBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertMerchantOffersBody");

export const UpsertResponseSchema = z
  .object({ id: z.number().int(), version: z.string() })
  .openapi("UpsertMerchantOfferResponse");
export const BatchUpsertResponseSchema = z
  .object({ ids: z.array(z.number().int()), version: z.string() })
  .openapi("BatchUpsertMerchantOffersResponse");

export type UpsertMerchantOfferBody = z.infer<typeof UpsertMerchantOfferBodySchema>;
export type BatchUpsertMerchantOffersBody = z.infer<typeof BatchUpsertMerchantOffersBodySchema>;
