import { registerCrudRoutes } from "../../shared/services/crudRoutes";
import { glyphsController } from "./GlyphsController";
import {
  BatchCreateGlyphsBodySchema,
  BatchCreatedResponseSchema,
  CodeParamsSchema,
  CreateGlyphBodySchema,
  CreatedResponseSchema,
  DeleteGlyphBodySchema,
  GlyphSchema,
  ListGlyphsQuerySchema,
  UpdateGlyphBodySchema,
  UpdatedResponseSchema,
} from "./GlyphsTypes";

export const glyphsRouter = registerCrudRoutes({
  basePath: "/glyphs",
  tag: "glyphs",
  controllers: glyphsController,
  schemas: {
    listQuery: ListGlyphsQuerySchema,
    codeParams: CodeParamsSchema,
    createBody: CreateGlyphBodySchema,
    updateBody: UpdateGlyphBodySchema,
    batchCreateBody: BatchCreateGlyphsBodySchema,
    resource: GlyphSchema,
    createdResponse: CreatedResponseSchema,
    updatedResponse: UpdatedResponseSchema,
    batchCreatedResponse: BatchCreatedResponseSchema,
    deleteBody: DeleteGlyphBodySchema,
  },
});
