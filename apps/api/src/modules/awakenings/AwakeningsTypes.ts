import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const AwakeningSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "DSP-001" }),
    creatureId: z.number().int(),
    name: z.string(),
    type: z.enum(["reinforcement", "swap"]),
    activationChancePct: z.number().int().nullable(),
    referenceSpecies: z.string().nullable(),
    visualChanges: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Awakening", {
    description:
      "Ancestral Awakening: a temporary transformation of a creature, with return to its base form. One-to-one with creatures.",
  });

export const AWAKENING_FIELDS = [
  "id", "code", "creatureId", "name", "type", "activationChancePct", "referenceSpecies",
  "visualChanges", "notes", "createdAt", "updatedAt",
] as const;

export const ListAwakeningsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  creatureCode: z.string().optional(),
  type: z.enum(["reinforcement", "swap"]).optional(),
});
export const CodeParamsSchema = z.object({ code: z.string().openapi({ example: "DSP-001" }) });

const coreSchema = z.object({
  code: z.string().min(3).max(16),
  creatureCode: z.string().openapi({
    example: "CRT-001",
    description: "Reference by creature code — 1-to-1: fails 409 if the creature already has one",
  }),
  name: z.string().min(1).max(128),
  type: z.enum(["reinforcement", "swap"]),
  activationChancePct: z.number().int().min(0).max(100).nullish(),
  referenceSpecies: z.string().max(128).nullish(),
  visualChanges: z.string().max(2000).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const CreateAwakeningBodySchema = coreSchema.merge(changeMetadataSchema).openapi("CreateAwakeningBody");
export const UpdateAwakeningBodySchema = coreSchema.partial().merge(changeMetadataSchema).openapi("UpdateAwakeningBody");
export const BatchCreateAwakeningsBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchCreateAwakeningsBody");

export const CreatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("CreatedResponse");
export const UpdatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("UpdatedResponse");
export const BatchCreatedResponseSchema = z.object({ codes: z.array(z.string()), version: z.string() }).openapi("BatchCreatedResponse");

export type CreateAwakeningBody = z.infer<typeof CreateAwakeningBodySchema>;
export type UpdateAwakeningBody = z.infer<typeof UpdateAwakeningBodySchema>;
export type BatchCreateAwakeningsBody = z.infer<typeof BatchCreateAwakeningsBodySchema>;
