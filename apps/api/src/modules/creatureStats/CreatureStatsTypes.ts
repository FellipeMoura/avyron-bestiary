import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const CreatureStatSchema = z
  .object({
    id: z.number().int(),
    creatureId: z.number().int(),
    baseHp: z.number().int(),
    baseAttack: z.number().int(),
    baseDefense: z.number().int(),
    baseSpeed: z.number().int(),
    baseCharge: z.number().int(),
    growthRate: z.number(),
    xpYield: z.number().int(),
    sizeMeters: z.number(),
    realSizeMeters: z.number().nullable(),
    awakeningMultiplier: z.number(),
    awakeningDurationTurns: z.number().int(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("CreatureStat");

export const CREATURE_STAT_FIELDS = [
  "id", "creatureId", "baseHp", "baseAttack", "baseDefense", "baseSpeed",
  "baseCharge", "growthRate", "xpYield", "sizeMeters", "realSizeMeters",
  "awakeningMultiplier", "awakeningDurationTurns",
  "notes", "createdAt", "updatedAt",
] as const;

/** Columns an agent may set. Excludes id / creatureId / timestamps. */
export const CREATURE_STAT_PAYLOAD = [
  "baseHp", "baseAttack", "baseDefense", "baseSpeed", "baseCharge",
  "growthRate", "xpYield", "sizeMeters", "realSizeMeters",
  "awakeningMultiplier", "awakeningDurationTurns", "notes",
] as const;

export const ListCreatureStatsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  creatureCode: z.string().optional(),
});

export const CreatureCodeParamsSchema = z.object({
  code: z.string().openapi({ example: "CRT-001" }),
});

const coreSchema = z.object({
  creatureCode: z.string().openapi({ example: "CRT-001" }),
  baseHp: z.number().int().min(1).max(999).openapi({ example: 55 }),
  baseAttack: z.number().int().min(1).max(999).openapi({ example: 40 }),
  baseDefense: z.number().int().min(1).max(999).openapi({ example: 62 }),
  baseSpeed: z.number().int().min(1).max(999).openapi({ example: 30 }),
  baseCharge: z.number().int().min(1).max(999).openapi({
    description: "Quão rápido a criatura enche o medidor do Despertar Ancestral. 50 é neutro.",
    example: 48,
  }),
  growthRate: z.number().min(0.001).max(0.2).optional().openapi({
    description: "valor(nível) = floor(base * (1 + growthRate * (nível - 1))). Típico 0.02–0.05.",
    example: 0.03,
  }),
  xpYield: z.number().int().min(1).max(500).optional().openapi({
    description:
      "Quanto esta espécie vale ao ser derrotada: floor(xpYield * nívelDoAlvo / progression_rules.xpYieldDivisor). Convenção do elenco: soma dos cinco stats base dividida por 5.",
    example: 62,
  }),
  sizeMeters: z.number().min(0.9).max(4.5).optional().openapi({
    description:
      "Maior dimensão em unidades Godot, na escala dramatizada. Piso 0.9 (metade do jogador), teto 4.5 (2,5x). Ver o documento `escala-das-criaturas`.",
    example: 2.69,
  }),
  realSizeMeters: z.number().gt(0).max(100).nullish().openapi({
    description: "Tamanho paleontológico real em metros. Editorial — o jogo não lê.",
    example: 2.5,
  }),
  awakeningMultiplier: z.number().min(1).max(3).optional().openapi({ example: 1.5 }),
  awakeningDurationTurns: z.number().int().min(1).max(10).optional().openapi({ example: 3 }),
  notes: z.string().max(500).nullish(),
});

export const UpsertCreatureStatBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertCreatureStatBody");

export const BatchUpsertCreatureStatsBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertCreatureStatsBody");

export const UpsertResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpsertCreatureStatResponse");
export const BatchUpsertResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchUpsertCreatureStatsResponse");

export type UpsertCreatureStatBody = z.infer<typeof UpsertCreatureStatBodySchema>;
export type BatchUpsertCreatureStatsBody = z.infer<typeof BatchUpsertCreatureStatsBodySchema>;
