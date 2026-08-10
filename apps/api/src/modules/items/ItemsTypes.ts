import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

/**
 * O que o item é. Virou enum quando o comerciante entrou: o export filtra
 * minério nesta coluna, e como texto livre ele levava a tabela inteira para
 * `mining.items` — o primeiro item de loja teria sido exportado como minerável.
 *
 * `material` é o que cai de criatura selvagem derrotada e se gasta no
 * level-up. Não é `mineral` justamente para não voltar a cair no filtro de
 * minério.
 */
export const ITEM_CATEGORIES = ["mineral", "capture", "heal", "material"] as const;

export const ItemSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "ITM-001" }),
    name: z.string(),
    category: z.enum(ITEM_CATEGORIES),
    effect: z.string().nullable(),
    acquisition: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Item");

export const ITEM_FIELDS = [
  "id", "code", "name", "category", "effect", "acquisition", "notes", "createdAt", "updatedAt",
] as const;

export const ListItemsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  category: z.enum(ITEM_CATEGORIES).optional(),
});
export const CodeParamsSchema = z.object({ code: z.string().openapi({ example: "ITM-001" }) });

const coreSchema = z.object({
  code: z.string().min(3).max(16),
  name: z.string().min(1).max(128),
  category: z.enum(ITEM_CATEGORIES).optional().openapi({ example: "mineral" }),
  effect: z.string().max(2000).nullish(),
  acquisition: z.string().max(500).nullish(),
  notes: z.string().max(2000).nullish(),
});

// `code` optional on single-create — factory auto-generates `ITM-NNN`.
export const CreateItemBodySchema = coreSchema
  .extend({ code: coreSchema.shape.code.optional() })
  .merge(changeMetadataSchema)
  .openapi("CreateItemBody");
export const UpdateItemBodySchema = coreSchema.partial().merge(changeMetadataSchema).openapi("UpdateItemBody");
export const BatchCreateItemsBodySchema = z.object({
  items: z.array(coreSchema).min(1).max(100),
  reason: changeMetadataSchema.shape.reason,
  impact: changeMetadataSchema.shape.impact,
}).openapi("BatchCreateItemsBody");

export const CreatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("CreatedResponse");
export const UpdatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("UpdatedResponse");
export const BatchCreatedResponseSchema = z.object({ codes: z.array(z.string()), version: z.string() }).openapi("BatchCreatedResponse");
export const DeleteItemBodySchema = changeMetadataSchema.openapi("DeleteItemBody");

export type CreateItemBody = z.infer<typeof CreateItemBodySchema>;
export type UpdateItemBody = z.infer<typeof UpdateItemBodySchema>;
export type BatchCreateItemsBody = z.infer<typeof BatchCreateItemsBodySchema>;
export type DeleteItemBody = z.infer<typeof DeleteItemBodySchema>;
