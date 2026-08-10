import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const AbilitySchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "HAB-001" }),
    name: z.string(),
    elementId: z.number().int().nullable(),
    type: z.string().nullable(),
    effect: z.string().nullable(),
    awakeningOnly: z.boolean(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Ability");

export const ABILITY_FIELDS = [
  "id", "code", "name", "elementId", "type", "effect", "awakeningOnly", "notes",
  "createdAt", "updatedAt",
] as const;

export const ListAbilitiesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  elementCode: z.string().optional(),
  type: z.string().optional(),
  awakeningOnly: z.coerce.boolean().optional(),
});
export const CodeParamsSchema = z.object({ code: z.string().openapi({ example: "HAB-001" }) });

const coreSchema = z.object({
  code: z.string().min(3).max(16),
  name: z.string().min(1).max(128),
  elementCode: z.string().nullish().openapi({
    example: "ELE-002",
    description: "Reference by element code — resolved server-side. Null = no elemental affinity.",
  }),
  type: z.string().max(64).nullish(),
  effect: z.string().max(2000).nullish(),
  awakeningOnly: z.boolean().default(false),
  notes: z.string().max(2000).nullish(),
});

export const CreateAbilityBodySchema = coreSchema.merge(changeMetadataSchema).openapi("CreateAbilityBody");
export const UpdateAbilityBodySchema = coreSchema.partial().merge(changeMetadataSchema).openapi("UpdateAbilityBody");
export const BatchCreateAbilitiesBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchCreateAbilitiesBody");

export const CreatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("CreatedResponse");
export const UpdatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("UpdatedResponse");
export const BatchCreatedResponseSchema = z.object({ codes: z.array(z.string()), version: z.string() }).openapi("BatchCreatedResponse");

export type CreateAbilityBody = z.infer<typeof CreateAbilityBodySchema>;
export type UpdateAbilityBody = z.infer<typeof UpdateAbilityBodySchema>;
export type BatchCreateAbilitiesBody = z.infer<typeof BatchCreateAbilitiesBodySchema>;
