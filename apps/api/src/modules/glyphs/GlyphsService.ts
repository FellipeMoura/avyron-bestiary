import { schema } from "@bestiary/db";
import { createSimpleCrudService } from "../../shared/services/crudFactory";
import { GLYPH_FIELDS } from "./GlyphsTypes";

export const glyphsService = createSimpleCrudService({
  table: schema.glyphs,
  entityName: "glyphs",
  humanName: "Glyph",
  allowedFields: GLYPH_FIELDS,
  displayField: "name",
  codePrefix: "GLF",
});
