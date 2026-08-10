import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const CreatureClassSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "CLS-001" }),
    name: z.string(),
    biologicalScope: z.string().nullable(),
    passive: z.string().nullable(),
    workFunction: z.string().nullable(),
    fusionRule: z.string().nullable(),
    status: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("CreatureClass", {
    description:
      "Biological lineage. Classes do NOT influence combat — hard rule from Changelog 0.01.",
  });

export const CREATURE_CLASS_FIELDS = [
  "id",
  "code",
  "name",
  "biologicalScope",
  "passive",
  "workFunction",
  "fusionRule",
  "status",
  "createdAt",
  "updatedAt",
] as const;

export const ListCreatureClassesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
});

export const CodeParamsSchema = z.object({
  code: z.string().openapi({ example: "CLS-001" }),
});

const coreSchema = z.object({
  code: z.string().min(3).max(16),
  name: z.string().min(1).max(64),
  biologicalScope: z.string().max(500).nullish(),
  passive: z.string().max(500).nullish(),
  workFunction: z.string().max(500).nullish(),
  fusionRule: z.string().max(500).nullish(),
  status: z.string().max(32).nullish(),
});

// See ElementsTypes for the rationale on making `code` optional only for
// single-create (the factory auto-generates `CLS-NNN`).
export const CreateCreatureClassBodySchema = coreSchema
  .extend({ code: coreSchema.shape.code.optional() })
  .merge(changeMetadataSchema)
  .openapi("CreateCreatureClassBody");

export const UpdateCreatureClassBodySchema = coreSchema
  .partial()
  .merge(changeMetadataSchema)
  .openapi("UpdateCreatureClassBody");

export const BatchCreateCreatureClassesBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(100),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchCreateCreatureClassesBody");

export const CreatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("CreatedResponse");
export const UpdatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpdatedResponse");
export const BatchCreatedResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchCreatedResponse");

export const DeleteCreatureClassBodySchema = changeMetadataSchema.openapi(
  "DeleteCreatureClassBody",
);

export type CreateCreatureClassBody = z.infer<typeof CreateCreatureClassBodySchema>;
export type UpdateCreatureClassBody = z.infer<typeof UpdateCreatureClassBodySchema>;
export type BatchCreateCreatureClassesBody = z.infer<typeof BatchCreateCreatureClassesBodySchema>;
export type DeleteCreatureClassBody = z.infer<typeof DeleteCreatureClassBodySchema>;
