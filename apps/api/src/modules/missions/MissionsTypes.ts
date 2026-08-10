import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const MissionSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "MIS-001" }),
    name: z.string(),
    type: z.string().nullable(),
    mapId: z.number().int().nullable(),
    npcId: z.number().int().nullable(),
    requirement: z.string().nullable(),
    reward: z.string().nullable(),
    status: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Mission");

export const MISSION_FIELDS = [
  "id", "code", "name", "type", "mapId", "npcId", "requirement", "reward", "status",
  "createdAt", "updatedAt",
] as const;

export const ListMissionsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  mapCode: z.string().optional(),
  npcCode: z.string().optional(),
  type: z.string().optional(),
});
export const CodeParamsSchema = z.object({ code: z.string().openapi({ example: "MIS-001" }) });

const coreSchema = z.object({
  code: z.string().min(3).max(16),
  name: z.string().min(1).max(128),
  type: z.string().max(64).nullish(),
  mapCode: z.string().nullish().openapi({ example: "PZ-01" }),
  npcCode: z.string().nullish().openapi({ example: "NPC-001" }),
  requirement: z.string().max(2000).nullish(),
  reward: z.string().max(2000).nullish(),
  status: z.string().max(32).nullish(),
});

export const CreateMissionBodySchema = coreSchema.merge(changeMetadataSchema).openapi("CreateMissionBody");
export const UpdateMissionBodySchema = coreSchema.partial().merge(changeMetadataSchema).openapi("UpdateMissionBody");
export const BatchCreateMissionsBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchCreateMissionsBody");

export const CreatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("CreatedResponse");
export const UpdatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("UpdatedResponse");
export const BatchCreatedResponseSchema = z.object({ codes: z.array(z.string()), version: z.string() }).openapi("BatchCreatedResponse");

export type CreateMissionBody = z.infer<typeof CreateMissionBodySchema>;
export type UpdateMissionBody = z.infer<typeof UpdateMissionBodySchema>;
export type BatchCreateMissionsBody = z.infer<typeof BatchCreateMissionsBodySchema>;
