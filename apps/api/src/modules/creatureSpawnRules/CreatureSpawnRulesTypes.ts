import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const CreatureSpawnRuleSchema = z
  .object({
    id: z.number().int(),
    creatureId: z.number().int(),
    spawnWeight: z.number(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("CreatureSpawnRule");

export const CREATURE_SPAWN_RULE_FIELDS = [
  "id", "creatureId", "spawnWeight", "notes", "createdAt", "updatedAt",
] as const;

export const CREATURE_SPAWN_RULE_PAYLOAD = ["spawnWeight", "notes"] as const;

export const ListCreatureSpawnRulesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  creatureCode: z.string().optional(),
});

export const CreatureCodeParamsSchema = z.object({
  code: z.string().openapi({ example: "CRT-001" }),
});

const coreSchema = z.object({
  creatureCode: z.string().openapi({ example: "CRT-001" }),
  spawnWeight: z.number().positive().openapi({
    description:
      "Peso RELATIVO no sorteio de spawn selvagem, dentro do pool do mapa da criatura. " +
      "2.0 é o dobro de um 1.0 do mesmo pool; os pesos não precisam somar nada. " +
      "Precisa ser > 0 — espécie que não deve nascer no mundo fica sem mapa.",
    example: 1,
  }),
  notes: z.string().max(500).nullish(),
});

export const UpsertCreatureSpawnRuleBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertCreatureSpawnRuleBody");

export const BatchUpsertCreatureSpawnRulesBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertCreatureSpawnRulesBody");

export const UpsertResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpsertCreatureSpawnRuleResponse");
export const BatchUpsertResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchUpsertCreatureSpawnRulesResponse");

export type UpsertCreatureSpawnRuleBody = z.infer<typeof UpsertCreatureSpawnRuleBodySchema>;
export type BatchUpsertCreatureSpawnRulesBody = z.infer<
  typeof BatchUpsertCreatureSpawnRulesBodySchema
>;
