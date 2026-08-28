import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const NpcDuelistSchema = z
  .object({
    id: z.number().int(),
    npcId: z.number().int(),
    opponentCreatureId: z.number().int(),
    opponentLevel: z.number().int(),
    grantsGlyphId: z.number().int().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("NpcDuelist");

export const NPC_DUELIST_FIELDS = [
  "id", "npcId", "opponentCreatureId", "opponentLevel", "grantsGlyphId", "notes",
  "createdAt", "updatedAt",
] as const;

export const ListNpcDuelistsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  npcCode: z.string().optional(),
  glyphCode: z.string().optional(),
});
export const NpcCodeParamsSchema = z.object({
  code: z.string().openapi({ example: "NPC-002" }),
});

const coreSchema = z.object({
  npcCode: z.string().openapi({ example: "NPC-002" }),
  /** Which creature the duelist fields. */
  opponentCreatureCode: z.string().openapi({ example: "CRT-021" }),
  /** Bounded here against nonsense; the real ceiling is `combat_rules.levelMax`. */
  opponentLevel: z.number().int().min(1).max(200),
  /**
   * Null for an intermediate arena — it is a real duel with its own reward,
   * not a gate. Only the arena of the last map of an era grants the Glifo
   * that opens the next one, which is why this is also UNIQUE in the table.
   */
  grantsGlyphCode: z.string().nullish().openapi({ example: "GLF-001" }),
  notes: z.string().max(2000).nullish(),
});

export const UpsertNpcDuelistBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertNpcDuelistBody");
export const BatchUpsertNpcDuelistsBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchUpsertNpcDuelistsBody");

export const UpsertResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("UpsertNpcDuelistResponse");
export const BatchUpsertResponseSchema = z.object({ codes: z.array(z.string()), version: z.string() }).openapi("BatchUpsertNpcDuelistsResponse");

export type UpsertNpcDuelistBody = z.infer<typeof UpsertNpcDuelistBodySchema>;
export type BatchUpsertNpcDuelistsBody = z.infer<typeof BatchUpsertNpcDuelistsBodySchema>;
