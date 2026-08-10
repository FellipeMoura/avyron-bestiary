import { schema } from "@bestiary/db";
import { createSimpleCrudService } from "../../shared/services/crudFactory";
import { BIOME_FIELDS } from "./BiomesTypes";

export const biomesService = createSimpleCrudService({
  table: schema.biomes,
  entityName: "biomes",
  humanName: "Biome",
  allowedFields: BIOME_FIELDS,
  displayField: "name",
  codePrefix: "BIO",
});
