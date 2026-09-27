import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

/**
 * A escada de uma arena. Junção npc (duelista) × número do estágio, com
 * semântica de upsert, mesmo formato de `merchant-offers`: re-POST com a mesma
 * chave natural troca o oponente, o nível ou o prêmio — sem PATCH e sem DELETE.
 */
export const ArenaStageSchema = z
  .object({
    id: z.number().int(),
    npcId: z.number().int(),
    stage: z.number().int(),
    opponentCreatureId: z.number().int(),
    opponentLevel: z.number().int(),
    rewardCurrency: z.number().int(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("ArenaStage");

export const ARENA_STAGE_FIELDS = [
  "id", "npcId", "stage", "opponentCreatureId", "opponentLevel", "rewardCurrency", "notes",
  "createdAt", "updatedAt",
] as const;

export const ListArenaStagesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  npcCode: z.string().optional(),
});

const coreSchema = z.object({
  npcCode: z.string().openapi({ example: "NPC-002" }),
  stage: z.number().int().min(1).max(100).openapi({
    description:
      "Degrau da escada, a partir de 1. O estágio N é a dificuldade N. O export " +
      "exige a sequência contígua (1..N): degrau faltando é degrau que ninguém passa.",
    example: 1,
  }),
  opponentCreatureCode: z.string().openapi({ example: "CRT-003" }),
  /** Limitado aqui só contra absurdo; o teto real é `combat_rules.levelMax`, cobrado no export. */
  opponentLevel: z.number().int().min(1).max(200),
  rewardCurrency: z.number().int().min(0).max(1000000).optional().openapi({
    description: "Pago uma vez, na primeira vitória do estágio. Refazer paga só XP.",
    example: 40,
  }),
  notes: z.string().max(2000).nullish(),
});

export const UpsertArenaStageBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertArenaStageBody");

export const BatchUpsertArenaStagesBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(100),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertArenaStagesBody");

export const UpsertResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpsertArenaStageResponse");
export const BatchUpsertResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchUpsertArenaStagesResponse");

export type UpsertArenaStageBody = z.infer<typeof UpsertArenaStageBodySchema>;
export type BatchUpsertArenaStagesBody = z.infer<typeof BatchUpsertArenaStagesBodySchema>;
