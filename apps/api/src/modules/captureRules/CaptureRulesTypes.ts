import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const CaptureRuleSchema = z
  .object({
    id: z.number().int(),
    creatureId: z.number().int(),
    catchRate: z.number().int(),
    awakenedMultiplier: z.number(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("CaptureRule");

export const CAPTURE_RULE_FIELDS = [
  "id", "creatureId", "catchRate", "awakenedMultiplier", "notes", "createdAt", "updatedAt",
] as const;

export const CAPTURE_RULE_PAYLOAD = ["catchRate", "awakenedMultiplier", "notes"] as const;

export const ListCaptureRulesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  creatureCode: z.string().optional(),
});

export const CreatureCodeParamsSchema = z.object({
  code: z.string().openapi({ example: "CRT-001" }),
});

const coreSchema = z.object({
  creatureCode: z.string().openapi({ example: "CRT-001" }),
  catchRate: z.number().int().min(1).max(255).openapi({
    description: "1–255, maior é mais fácil. Convenção herdada do gênero para leitura intuitiva.",
    example: 190,
  }),
  awakenedMultiplier: z.number().min(0.01).max(2).optional().openapi({
    description:
      "Multiplicador aplicado quando o alvo está em Despertar Ancestral. Abaixo de 1 dificulta.",
    example: 0.5,
  }),
  notes: z.string().max(500).nullish(),
});

export const UpsertCaptureRuleBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertCaptureRuleBody");

export const BatchUpsertCaptureRulesBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertCaptureRulesBody");

export const UpsertResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpsertCaptureRuleResponse");
export const BatchUpsertResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchUpsertCaptureRulesResponse");

export type UpsertCaptureRuleBody = z.infer<typeof UpsertCaptureRuleBodySchema>;
export type BatchUpsertCaptureRulesBody = z.infer<typeof BatchUpsertCaptureRulesBodySchema>;
