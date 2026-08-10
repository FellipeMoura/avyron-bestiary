import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const GameMapSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "PZ-01" }),
    era: z.enum(["paleozoic", "mesozoic", "cenozoic"]),
    name: z.string(),
    sortOrder: z.number().int(),
    biomeProgressionRaw: z.string().nullable(),
    status: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("GameMap");

export const GAME_MAP_FIELDS = [
  "id", "code", "era", "name", "sortOrder", "biomeProgressionRaw", "status", "notes",
  "createdAt", "updatedAt",
] as const;

export const ListGameMapsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  era: z.enum(["paleozoic", "mesozoic", "cenozoic"]).optional(),
});
export const CodeParamsSchema = z.object({ code: z.string().openapi({ example: "PZ-01" }) });

const coreSchema = z.object({
  code: z.string().min(3).max(16),
  era: z.enum(["paleozoic", "mesozoic", "cenozoic"]),
  name: z.string().min(1).max(128),
  sortOrder: z.number().int().min(0).default(0),
  biomeProgressionRaw: z.string().max(2000).nullish(),
  status: z.string().max(32).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const CreateGameMapBodySchema = coreSchema.merge(changeMetadataSchema).openapi("CreateGameMapBody");
export const UpdateGameMapBodySchema = coreSchema.partial().merge(changeMetadataSchema).openapi("UpdateGameMapBody");
export const BatchCreateGameMapsBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchCreateGameMapsBody");

export const CreatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("CreatedResponse");
export const UpdatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("UpdatedResponse");
export const BatchCreatedResponseSchema = z.object({ codes: z.array(z.string()), version: z.string() }).openapi("BatchCreatedResponse");
export const DeleteGameMapBodySchema = changeMetadataSchema.openapi("DeleteGameMapBody");

export type CreateGameMapBody = z.infer<typeof CreateGameMapBodySchema>;
export type UpdateGameMapBody = z.infer<typeof UpdateGameMapBodySchema>;
export type BatchCreateGameMapsBody = z.infer<typeof BatchCreateGameMapsBodySchema>;
export type DeleteGameMapBody = z.infer<typeof DeleteGameMapBodySchema>;
