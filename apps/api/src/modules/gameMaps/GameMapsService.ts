import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import { createSimpleCrudService } from "../../shared/services/crudFactory";
import { buildProjection, parseFields } from "../../shared/services/query";
import { GAME_MAP_FIELDS } from "./GameMapsTypes";

const base = createSimpleCrudService({
  table: schema.gameMaps,
  entityName: "game_maps",
  humanName: "Map",
  allowedFields: GAME_MAP_FIELDS,
  displayField: "name",
});

export const gameMapsService = {
  ...base,
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    era?: "paleozoic" | "mesozoic" | "cenozoic";
  }) {
    const fields = parseFields(params.fields, GAME_MAP_FIELDS);
    const projection = buildProjection(
      schema.gameMaps as unknown as Record<string, unknown>,
      fields,
    );
    const filters = params.era ? [eq(schema.gameMaps.era, params.era)] : [];
    const q = projection ? db.select(projection).from(schema.gameMaps) : db.select().from(schema.gameMaps);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.gameMaps.sortOrder), asc(schema.gameMaps.code))
      .limit(params.limit)
      .offset(params.offset);
  },
};
