import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const DesignDocumentSchema = z
  .object({
    id: z.number().int(),
    slug: z.string().openapi({ example: "visao-geral" }),
    title: z.string(),
    sortOrder: z.number().int(),
    status: z.enum(["defined", "partial", "pending"]),
    bodyMarkdown: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("DesignDocument");

export const DESIGN_DOCUMENT_FIELDS = [
  "id", "slug", "title", "sortOrder", "status", "bodyMarkdown", "createdAt", "updatedAt",
] as const;

export const ListDesignDocumentsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  status: z.enum(["defined", "partial", "pending"]).optional(),
});

export const SlugParamsSchema = z.object({
  slug: z.string().openapi({ example: "visao-geral" }),
});

const coreSchema = z.object({
  slug: z.string().min(1).max(128),
  title: z.string().min(1).max(256),
  sortOrder: z.number().int().min(0).default(0),
  status: z.enum(["defined", "partial", "pending"]).default("pending"),
  bodyMarkdown: z.string().max(200_000),
});

export const CreateDesignDocumentBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("CreateDesignDocumentBody");
export const UpdateDesignDocumentBodySchema = coreSchema
  .partial()
  .merge(changeMetadataSchema)
  .openapi("UpdateDesignDocumentBody");

export const CreatedResponseSchema = z
  .object({ slug: z.string(), version: z.string() })
  .openapi("CreatedDesignDocumentResponse");
export const UpdatedResponseSchema = z
  .object({ slug: z.string(), version: z.string() })
  .openapi("UpdatedDesignDocumentResponse");

export type CreateDesignDocumentBody = z.infer<typeof CreateDesignDocumentBodySchema>;
export type UpdateDesignDocumentBody = z.infer<typeof UpdateDesignDocumentBodySchema>;
