import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const MiningRateSchema = z
  .object({
    id: z.number().int(),
    classId: z.number().int().nullable(),
    biomeId: z.number().int().nullable(),
    itemId: z.number().int(),
    weight: z.number().min(0).max(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("MiningRate");

export const MINING_RATE_FIELDS = [
  "id",
  "classId",
  "biomeId",
  "itemId",
  "weight",
  "createdAt",
  "updatedAt",
] as const;

export const ListMiningRatesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  classCode: z.string().optional(),
  biomeCode: z.string().optional(),
  itemCode: z.string().optional(),
});

const coreShape = z.object({
  classCode: z.string().optional().openapi({ example: "CLS-001" }),
  biomeCode: z.string().optional().openapi({ example: "BIO-001" }),
  itemCode: z.string().openapi({ example: "ITM-001" }),
  weight: z.number().min(0).max(1).openapi({ example: 0.25 }),
});

const subjectRefine = (d: { classCode?: string; biomeCode?: string }) =>
  Boolean(d.classCode) !== Boolean(d.biomeCode);
const subjectRefinement = { message: "Exactly one of classCode or biomeCode must be provided" };

/**
 * Upsert semantics: natural key is (classCode + itemCode) or (biomeCode + itemCode).
 * Re-POST to change the weight. No PATCH/DELETE.
 */
export const UpsertMiningRateBodySchema = coreShape
  .merge(changeMetadataSchema)
  .refine(subjectRefine, subjectRefinement)
  .openapi("UpsertMiningRateBody");

export const BatchUpsertMiningRatesBodySchema = z
  .object({
    items: z.array(coreShape.refine(subjectRefine, subjectRefinement)).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertMiningRatesBody");

export const UpsertResponseSchema = z
  .object({ id: z.number().int(), version: z.string() })
  .openapi("UpsertMiningRateResponse");
export const BatchUpsertResponseSchema = z
  .object({ ids: z.array(z.number().int()), version: z.string() })
  .openapi("BatchUpsertMiningRatesResponse");

export type UpsertMiningRateBody = z.infer<typeof UpsertMiningRateBodySchema>;
export type BatchUpsertMiningRatesBody = z.infer<typeof BatchUpsertMiningRatesBodySchema>;
