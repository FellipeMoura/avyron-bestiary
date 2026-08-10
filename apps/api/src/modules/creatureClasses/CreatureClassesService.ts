import { schema } from "@bestiary/db";
import { createSimpleCrudService } from "../../shared/services/crudFactory";
import { CREATURE_CLASS_FIELDS } from "./CreatureClassesTypes";

export const creatureClassesService = createSimpleCrudService({
  table: schema.creatureClasses,
  entityName: "creature_classes",
  humanName: "Creature class",
  allowedFields: CREATURE_CLASS_FIELDS,
  displayField: "name",
  codePrefix: "CLS",
});
