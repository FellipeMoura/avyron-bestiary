import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const EQUIPMENT_SLOTS = ["amplifier", "enchanter"] as const;

// ---------------------------------------------------------------------------
// response
// ---------------------------------------------------------------------------

export const EquipmentSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "EQP-001" }),
    name: z.string(),
    slot: z.enum(EQUIPMENT_SLOTS),
    effect: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Equipment");

export const EQUIPMENT_FIELDS = [
  "id",
  "code",
  "name",
  "slot",
  "effect",
  "notes",
  "createdAt",
  "updatedAt",
] as const;

// ---------------------------------------------------------------------------
// list query
// ---------------------------------------------------------------------------

export const ListEquipmentQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  slot: z.enum(EQUIPMENT_SLOTS).optional().openapi({
    description: "Filter by set slot. Models of the same slot are alternatives to each other.",
  }),
});

// ---------------------------------------------------------------------------
// path params
// ---------------------------------------------------------------------------

export const CodeParamsSchema = z.object({
  code: z.string().openapi({ example: "EQP-001" }),
});

// ---------------------------------------------------------------------------
// create / update
//
// `slot` is a plain enum, not a code — it names a position in the player's
// set, and there is no `slots` table for it to reference. It is fixed for the
// model's lifetime for the same reason a relic's element is: the crafted
// object does not change what it is.
// ---------------------------------------------------------------------------

const equipmentCoreSchema = z.object({
  code: z.string().min(3).max(16).openapi({ example: "EQP-001" }),
  name: z.string().min(1).max(128).openapi({ example: "Amplificador de Cobre" }),
  slot: z.enum(EQUIPMENT_SLOTS).openapi({
    example: "amplifier",
    description:
      "amplifier applies its modifier to the player's own creature; enchanter to the opponent's. "
      + "The slot decides the target — `effectCode` in equipment-stats decides only which stat.",
  }),
  effect: z.string().max(500).nullish().openapi({
    description: "Prose for the web catalog. The executable pair lives in equipment-stats.",
  }),
  notes: z.string().max(2000).nullish(),
});

export const CreateEquipmentBodySchema = equipmentCoreSchema
  .merge(changeMetadataSchema)
  .openapi("CreateEquipmentBody");

export const UpdateEquipmentBodySchema = equipmentCoreSchema
  .partial()
  .merge(changeMetadataSchema)
  .openapi("UpdateEquipmentBody");

export const BatchCreateEquipmentBodySchema = z
  .object({
    items: z.array(equipmentCoreSchema).min(1).max(100),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchCreateEquipmentBody");

// ---------------------------------------------------------------------------
// write response envelopes
// ---------------------------------------------------------------------------

export const CreatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("CreatedEquipmentResponse");

export const UpdatedResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpdatedEquipmentResponse");

export const BatchCreatedResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchCreatedEquipmentResponse");

export type CreateEquipmentBody = z.infer<typeof CreateEquipmentBodySchema>;
export type UpdateEquipmentBody = z.infer<typeof UpdateEquipmentBodySchema>;
export type BatchCreateEquipmentBody = z.infer<typeof BatchCreateEquipmentBodySchema>;
