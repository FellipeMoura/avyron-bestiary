import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const RelicStatSchema = z
  .object({
    id: z.number().int(),
    relicId: z.number().int(),
    slotCapacity: z.number().int(),
    baseCaptureRate: z.number().int(),
    captureRatePerLevel: z.number(),
    maxLevel: z.number().int(),
    combatBuffBase: z.number(),
    combatBuffPerLevel: z.number(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("RelicStat");

export const RELIC_STAT_FIELDS = [
  "id",
  "relicId",
  "slotCapacity",
  "baseCaptureRate",
  "captureRatePerLevel",
  "maxLevel",
  "combatBuffBase",
  "combatBuffPerLevel",
  "notes",
  "createdAt",
  "updatedAt",
] as const;

export const RELIC_STAT_PAYLOAD = [
  "slotCapacity",
  "baseCaptureRate",
  "captureRatePerLevel",
  "maxLevel",
  "combatBuffBase",
  "combatBuffPerLevel",
  "notes",
] as const;

export const ListRelicStatsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  relicCode: z.string().optional(),
});

export const RelicCodeParamsSchema = z.object({
  code: z.string().openapi({ example: "RLC-001" }),
});

const coreSchema = z.object({
  relicCode: z.string().openapi({ example: "RLC-001" }),
  slotCapacity: z.number().int().min(1).max(12).openapi({
    description: "Criaturas que o player carrega no mapa simultaneamente com este modelo equipado.",
    example: 3,
  }),
  baseCaptureRate: z.number().int().min(1).max(500).openapi({
    description: "Taxa de captura do relicário no nível 1. Numerador de base% na fórmula de captura.",
    example: 80,
  }),
  captureRatePerLevel: z.number().min(0).max(100).openapi({
    description: "Incremento da taxa de captura por nível acima de 1.",
    example: 4,
  }),
  maxLevel: z.number().int().min(1).max(999).optional().openapi({ example: 30 }),
  combatBuffBase: z.number().min(0).max(100).optional().openapi({
    description: "Placeholder — magnitude do buff de combate no nível 1, não-final.",
    example: 5,
  }),
  combatBuffPerLevel: z.number().min(0).max(100).optional().openapi({
    description: "Placeholder — incremento do buff de combate por nível, não-final.",
    example: 0.3,
  }),
  notes: z.string().max(500).nullish(),
});

export const UpsertRelicStatBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertRelicStatBody");

export const BatchUpsertRelicStatsBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertRelicStatsBody");

export const UpsertResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpsertRelicStatResponse");
export const BatchUpsertResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchUpsertRelicStatsResponse");

export type UpsertRelicStatBody = z.infer<typeof UpsertRelicStatBodySchema>;
export type BatchUpsertRelicStatsBody = z.infer<typeof BatchUpsertRelicStatsBodySchema>;
