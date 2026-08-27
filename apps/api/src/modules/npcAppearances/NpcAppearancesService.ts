import { schema } from "@bestiary/db";
import { createChildUpsertService } from "../../shared/services/childUpsertFactory";
import { NPC_APPEARANCE_FIELDS, NPC_APPEARANCE_PAYLOAD } from "./NpcAppearancesTypes";

export const npcAppearancesService = createChildUpsertService({
  table: schema.npcAppearances,
  parentTable: schema.npcs,
  parentIdColumn: schema.npcAppearances.npcId,
  parentIdKey: "npcId",
  parentCodeField: "npcCode",
  entityName: "npc_appearances",
  humanName: "NPC appearance",
  allowedFields: NPC_APPEARANCE_FIELDS,
  payloadKeys: NPC_APPEARANCE_PAYLOAD,
});
