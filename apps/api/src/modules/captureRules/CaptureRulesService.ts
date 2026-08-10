import { schema } from "@bestiary/db";
import { createChildUpsertService } from "../../shared/services/childUpsertFactory";
import { CAPTURE_RULE_FIELDS, CAPTURE_RULE_PAYLOAD } from "./CaptureRulesTypes";

export const captureRulesService = createChildUpsertService({
  table: schema.captureRules,
  parentTable: schema.creatures,
  parentIdColumn: schema.captureRules.creatureId,
  parentIdKey: "creatureId",
  parentCodeField: "creatureCode",
  entityName: "capture_rules",
  humanName: "Capture rule",
  allowedFields: CAPTURE_RULE_FIELDS,
  payloadKeys: CAPTURE_RULE_PAYLOAD,
});
