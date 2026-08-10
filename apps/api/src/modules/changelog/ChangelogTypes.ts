import { z } from "../../shared/openapi/zod";
import { paginationSchema } from "../../shared/services/query";

export const ChangelogEntrySchema = z
  .object({
    id: z.number().int(),
    version: z.string().openapi({ example: "0.11" }),
    date: z.string(),
    change: z.string(),
    reason: z.string(),
    impact: z.string(),
    entity: z.string().nullable(),
    entityId: z.number().int().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("ChangelogEntry");

export const ListChangelogQuerySchema = paginationSchema.extend({
  entity: z.string().optional().openapi({ description: "Filter by entity table name (ex: 'creatures')" }),
  entityId: z.coerce.number().int().optional(),
});

export const VersionParamsSchema = z.object({
  version: z.string().openapi({ example: "0.11" }),
});
