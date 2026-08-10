import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

// ---------------------------------------------------------------------------
// response
// ---------------------------------------------------------------------------

export const CreatureSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "CRT-001" }),
    originalName: z.string().openapi({ example: "Trilobita" }),
    baseSpecies: z.string().nullable(),
    classId: z.number().int(),
    elementId: z.number().int(),
    mapId: z.number().int().nullable(),
    biomeId: z.number().int().nullable(),
    role: z.string().nullable(),
    silhouetteNote: z.string().nullable(),
    status: z.string().nullable(),
    modelUrl: z.string().nullable().openapi({
      example: "/models/CRT-001.glb",
      description: "Public path to the .glb model file. Null while the asset hasn't been approved.",
    }),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Creature");

export const CREATURE_FIELDS = [
  "id",
  "code",
  "originalName",
  "baseSpecies",
  "classId",
  "elementId",
  "mapId",
  "biomeId",
  "role",
  "silhouetteNote",
  "status",
  "modelUrl",
  "createdAt",
  "updatedAt",
] as const;

// ---------------------------------------------------------------------------
// list query — filters callers ask for most often
// ---------------------------------------------------------------------------

export const ListCreaturesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  era: z.enum(["paleozoic", "mesozoic", "cenozoic"]).optional(),
  classCode: z.string().optional().openapi({
    description: "Filter by creature class code (ex: CLS-001)",
  }),
  elementCode: z.string().optional().openapi({ description: "Filter by element code (ex: ELE-002)" }),
  mapCode: z.string().optional().openapi({ description: "Filter by map code (ex: PZ-01)" }),
  biomeCode: z.string().optional(),
});

// ---------------------------------------------------------------------------
// path params
// ---------------------------------------------------------------------------

export const CodeParamsSchema = z.object({
  code: z.string().openapi({ example: "CRT-001" }),
});

// ---------------------------------------------------------------------------
// create / update — FKs by CODE, resolved server-side
// ---------------------------------------------------------------------------

const creatureCoreSchema = z.object({
  code: z.string().min(3).max(16).openapi({ example: "CRT-042" }),
  originalName: z.string().min(1).max(128),
  baseSpecies: z.string().max(128).nullish(),
  classCode: z.string().openapi({
    example: "CLS-001",
    description: "Reference by class code — resolved server-side to classId",
  }),
  elementCode: z.string().openapi({ example: "ELE-002" }),
  mapCode: z.string().nullish().openapi({ example: "PZ-01" }),
  biomeCode: z.string().nullish().openapi({ example: "BIO-001" }),
  role: z.string().max(64).nullish(),
  silhouetteNote: z.string().max(2000).nullish(),
  status: z.string().max(32).nullish(),
  modelUrl: z.string().max(500).nullish().openapi({
    example: "/models/CRT-042.glb",
    description: "Public path to the .glb model file served by the web static.",
  }),
});

export const CreateCreatureBodySchema = creatureCoreSchema
  .merge(changeMetadataSchema)
  .openapi("CreateCreatureBody");

export const UpdateCreatureBodySchema = creatureCoreSchema
  .partial()
  .merge(changeMetadataSchema)
  .openapi("UpdateCreatureBody");

export const BatchCreateCreaturesBodySchema = z
  .object({
    items: z.array(creatureCoreSchema).min(1).max(100),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchCreateCreaturesBody");

// ---------------------------------------------------------------------------
// write response envelopes (mirror elements pattern)
// ---------------------------------------------------------------------------

export const CreatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("CreatedResponse");

export const UpdatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpdatedResponse");

export const BatchCreatedResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchCreatedResponse");

export type CreateCreatureBody = z.infer<typeof CreateCreatureBodySchema>;
export type UpdateCreatureBody = z.infer<typeof UpdateCreatureBodySchema>;
export type BatchCreateCreaturesBody = z.infer<typeof BatchCreateCreaturesBodySchema>;
