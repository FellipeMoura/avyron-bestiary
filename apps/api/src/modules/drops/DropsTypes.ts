import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const DropSchema = z
  .object({
    id: z.number().int(),
    creatureId: z.number().int(),
    itemId: z.number().int(),
    chance: z.number().min(0).max(1),
    condition: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Drop");

export const DROP_FIELDS = [
  "id", "creatureId", "itemId", "chance", "condition", "createdAt", "updatedAt",
] as const;

export const ListDropsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  creatureCode: z.string().optional(),
  itemCode: z.string().optional(),
});

const coreSchema = z.object({
  creatureCode: z.string().openapi({ example: "CRT-001" }),
  itemCode: z.string().openapi({ example: "ITM-001" }),
  chance: z.number().min(0).max(1).openapi({ example: 0.15 }),
  condition: z.string().max(128).nullish().openapi({ example: "Qualquer derrota" }),
});

/**
 * Upsert semantics: the natural key is (creatureCode, itemCode, condition).
 * A second POST with the same triple updates `chance`. No PATCH — the agent
 * expresses "the chance changed" by POSTing again. DELETE exists, and only
 * for the case upsert cannot express: see `DeleteDropBodySchema`.
 */
export const UpsertDropBodySchema = coreSchema.merge(changeMetadataSchema).openapi("UpsertDropBody");
export const BatchUpsertDropsBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchUpsertDropsBody");

export const UpsertResponseSchema = z
  .object({ id: z.number().int(), version: z.string() })
  .openapi("UpsertDropResponse");
export const BatchUpsertResponseSchema = z
  .object({ ids: z.array(z.number().int()), version: z.string() })
  .openapi("BatchUpsertDropsResponse");

/**
 * The one thing upsert cannot say: "this creature no longer drops this."
 *
 * `chance: 0` does not mean it — a drop row that exists with chance 0 still
 * asserts the pairing, and the export's own check reads the row's existence,
 * not its odds. The case that forced this endpoint is reclassification: when a
 * creature changes class, its old material drop becomes a row pointing at
 * another class's item, `items.classId` no longer agrees with it, and
 * `pnpm game:export` aborts on every one of them. Re-POSTing only ever adds
 * the right drop next to the wrong one.
 *
 * Same shape as `DELETE /creature-abilities`, which is the precedent for a
 * junction that needs removal rather than rewriting.
 *
 * `condition` is part of the natural key, so it is part of the address: it
 * targets the row whose condition matches exactly, and omitting it targets the
 * row whose condition is NULL — mirroring the upsert's conflict target, which
 * is `nullsNotDistinct`. There is deliberately no "delete every condition for
 * this pair": that is a different operation, and a destructive one to get by
 * accident from a forgotten field.
 */
export const DeleteDropBodySchema = z
  .object({
    creatureCode: z.string().openapi({ example: "CRT-001" }),
    itemCode: z.string().openapi({ example: "ITM-019" }),
    condition: z.string().max(128).nullish().openapi({
      description:
        "Parte da chave natural. Omitido remove a linha cuja condição é nula, não todas as condições do par.",
      example: "Derrota em combate",
    }),
  })
  .merge(changeMetadataSchema)
  .openapi("DeleteDropBody");

export const DeletedResponseSchema = z
  .object({ id: z.number().int(), version: z.string() })
  .openapi("DeletedDropResponse");

export type UpsertDropBody = z.infer<typeof UpsertDropBodySchema>;
export type BatchUpsertDropsBody = z.infer<typeof BatchUpsertDropsBodySchema>;
export type DeleteDropBody = z.infer<typeof DeleteDropBodySchema>;
