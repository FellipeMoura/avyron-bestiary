import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody, validateParams, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { designDocumentsController } from "./DesignDocumentsController";
import {
  CreateDesignDocumentBodySchema,
  CreatedResponseSchema,
  DesignDocumentSchema,
  ListDesignDocumentsQuerySchema,
  SlugParamsSchema,
  UpdateDesignDocumentBodySchema,
  UpdatedResponseSchema,
} from "./DesignDocumentsTypes";

export const designDocumentsRouter = Router();
const TAG = "documents";

registry.registerPath({
  method: "get",
  path: "/documents",
  tags: [TAG],
  summary: "List Design Bible chapters",
  request: { query: ListDesignDocumentsQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(DesignDocumentSchema) } },
      description: "OK",
    },
  },
});
designDocumentsRouter.get(
  "/",
  validateQuery(ListDesignDocumentsQuerySchema),
  designDocumentsController.list,
);

registry.registerPath({
  method: "get",
  path: "/documents/{slug}",
  tags: [TAG],
  summary: "Get one document by slug",
  description:
    "Content negotiation: `Accept: text/markdown` returns the raw markdown body (no JSON wrapping — token cheap). Anything else returns the full JSON envelope with metadata.",
  request: { params: SlugParamsSchema },
  responses: {
    200: {
      description: "The document",
      content: {
        "application/json": { schema: DesignDocumentSchema },
        "text/markdown": { schema: { type: "string" } },
      },
    },
    404: { description: "Not found" },
  },
});
designDocumentsRouter.get(
  "/:slug",
  validateParams(SlugParamsSchema),
  designDocumentsController.getBySlug,
);

registry.registerPath({
  method: "post",
  path: "/documents",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Create a document",
  request: {
    body: { content: { "application/json": { schema: CreateDesignDocumentBodySchema } }, required: true },
  },
  responses: {
    201: { content: { "application/json": { schema: CreatedResponseSchema } }, description: "Created" },
    409: { description: "Slug already exists" },
  },
});
designDocumentsRouter.post(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(CreateDesignDocumentBodySchema),
  designDocumentsController.create,
);

registry.registerPath({
  method: "patch",
  path: "/documents/{slug}",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Update a document",
  request: {
    params: SlugParamsSchema,
    body: { content: { "application/json": { schema: UpdateDesignDocumentBodySchema } }, required: true },
  },
  responses: {
    200: { content: { "application/json": { schema: UpdatedResponseSchema } }, description: "Updated" },
    404: { description: "Not found" },
  },
});
designDocumentsRouter.patch(
  "/:slug",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateParams(SlugParamsSchema),
  validateBody(UpdateDesignDocumentBodySchema),
  designDocumentsController.update,
);
