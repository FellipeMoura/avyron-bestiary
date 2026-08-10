import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import type { BatchUpsertMapBiomesBody, UpsertMapBiomeBody } from "./MapBiomesTypes";
import { MAP_BIOME_FIELDS } from "./MapBiomesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function resolvePair(
  tx: Tx,
  item: { mapCode: string; biomeCode: string; sortOrder?: number },
) {
  const [mapId, biomeId] = await Promise.all([
    resolveCodeInTx(tx, schema.gameMaps, item.mapCode, "mapCode"),
    resolveCodeInTx(tx, schema.biomes, item.biomeCode, "biomeCode"),
  ]);
  return { mapId, biomeId, sortOrder: item.sortOrder ?? 0 };
}

export const mapBiomesService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    mapCode?: string;
    biomeCode?: string;
  }) {
    const fields = parseFields(params.fields, MAP_BIOME_FIELDS);
    const projection = buildProjection(
      schema.mapBiomes as unknown as Record<string, unknown>,
      fields,
    );
    const [mapId, biomeId] = await Promise.all([
      resolveOptionalCode(schema.gameMaps, params.mapCode, "mapCode"),
      resolveOptionalCode(schema.biomes, params.biomeCode, "biomeCode"),
    ]);
    const filters = [];
    if (mapId !== null) filters.push(eq(schema.mapBiomes.mapId, mapId));
    if (biomeId !== null) filters.push(eq(schema.mapBiomes.biomeId, biomeId));
    const q = projection
      ? db.select(projection).from(schema.mapBiomes)
      : db.select().from(schema.mapBiomes);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.mapBiomes.mapId), asc(schema.mapBiomes.sortOrder))
      .limit(params.limit)
      .offset(params.offset);
  },

  async upsert(body: UpsertMapBiomeBody) {
    return db.transaction(async (tx) => {
      const resolved = await resolvePair(tx, body);
      const inserted = await tx
        .insert(schema.mapBiomes)
        .values(resolved)
        .onConflictDoUpdate({
          target: [schema.mapBiomes.mapId, schema.mapBiomes.biomeId],
          set: { sortOrder: resolved.sortOrder, updatedAt: new Date() },
        })
        .returning({ id: schema.mapBiomes.id });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Map ${body.mapCode} linked to biome ${body.biomeCode} (order ${resolved.sortOrder})`,
        reason: body.reason,
        impact: body.impact,
        entity: "map_biomes",
        entityId: row.id,
      });
      return { id: row.id, version };
    });
  },

  async batchUpsert(body: BatchUpsertMapBiomesBody) {
    return db.transaction(async (tx) => {
      const resolvedRows = await Promise.all(body.items.map((it) => resolvePair(tx, it)));
      const inserted = await tx
        .insert(schema.mapBiomes)
        .values(resolvedRows)
        .onConflictDoUpdate({
          target: [schema.mapBiomes.mapId, schema.mapBiomes.biomeId],
          set: { sortOrder: schema.mapBiomes.sortOrder, updatedAt: new Date() },
        })
        .returning({ id: schema.mapBiomes.id });
      const ids = inserted.map((r) => r.id);
      const version = await recordChange(tx, {
        change: `${inserted.length} map-biome links upserted in batch`,
        reason: body.reason,
        impact: body.impact,
        entity: "map_biomes",
      });
      return { ids, version };
    });
  },
};
