import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import {
  MAP_BIOME_REGION_FIELDS,
  type BatchCreateMapBiomeRegionsBody,
  type CreateMapBiomeRegionBody,
  type DeleteMapBiomeRegionBody,
  type UpdateMapBiomeRegionBody,
} from "./MapBiomeRegionsTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/**
 * Turn the code-carrying body into a row. `mapCode`/`biomeCode` become ids;
 * everything else passes through untouched — `params` was already validated
 * against `shape` by the Zod schema, which is the only place that pairing can
 * be checked.
 */
async function toRow(tx: Tx, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { mapCode, biomeCode, reason, impact, ...rest } = body as Record<string, unknown> & {
    mapCode?: string;
    biomeCode?: string;
  };
  void reason;
  void impact;
  const row: Record<string, unknown> = { ...rest };
  if (mapCode !== undefined) {
    row.mapId = await resolveCodeInTx(tx, schema.gameMaps, mapCode, "mapCode");
  }
  if (biomeCode !== undefined) {
    row.biomeId = await resolveCodeInTx(tx, schema.biomes, biomeCode, "biomeCode");
  }
  return row;
}

/**
 * A region must name a biome the map actually has. Without this the row is
 * accepted, the game resolves a biome that does not belong to the map, and
 * `mining_rates` answers for a place the player cannot be — the same class of
 * silent wrongness `WorldRoot._assert_biome_belongs_to_map()` guards in Godot.
 */
async function assertBiomeBelongsToMap(
  tx: Tx,
  mapId: number,
  biomeId: number,
  mapCode: string,
  biomeCode: string,
): Promise<void> {
  const rows = await tx
    .select({ id: schema.mapBiomes.id })
    .from(schema.mapBiomes)
    .where(and(eq(schema.mapBiomes.mapId, mapId), eq(schema.mapBiomes.biomeId, biomeId)))
    .limit(1);
  if (!rows[0]) {
    throw new AppError(
      `biomeCode: '${biomeCode}' is not linked to map '${mapCode}' — add it to map_biomes first`,
      422,
    );
  }
}

export const mapBiomeRegionsService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    mapCode?: string;
    biomeCode?: string;
  }) {
    const fields = parseFields(params.fields, MAP_BIOME_REGION_FIELDS);
    const projection = buildProjection(
      schema.mapBiomeRegions as unknown as Record<string, unknown>,
      fields,
    );
    const [mapId, biomeId] = await Promise.all([
      resolveOptionalCode(schema.gameMaps, params.mapCode, "mapCode"),
      resolveOptionalCode(schema.biomes, params.biomeCode, "biomeCode"),
    ]);
    const filters = [];
    if (mapId !== null) filters.push(eq(schema.mapBiomeRegions.mapId, mapId));
    if (biomeId !== null) filters.push(eq(schema.mapBiomeRegions.biomeId, biomeId));
    const q = projection
      ? db.select(projection).from(schema.mapBiomeRegions)
      : db.select().from(schema.mapBiomeRegions);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.mapBiomeRegions.mapId), asc(schema.mapBiomeRegions.sortOrder))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getByCode(code: string) {
    const rows = await db
      .select()
      .from(schema.mapBiomeRegions)
      .where(eq(schema.mapBiomeRegions.code, code))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`Biome region '${code}' not found`, 404);
    return row;
  },

  async create(body: CreateMapBiomeRegionBody): Promise<{ code: string; version: string }> {
    return db.transaction(async (tx) => {
      const row = await toRow(tx, body);
      await assertBiomeBelongsToMap(
        tx,
        row.mapId as number,
        row.biomeId as number,
        body.mapCode,
        body.biomeCode,
      );
      const inserted = await tx
        .insert(schema.mapBiomeRegions)
        .values(row as never)
        .returning({ id: schema.mapBiomeRegions.id, code: schema.mapBiomeRegions.code })
        .catch((err) => {
          if (isUniqueViolation(err)) {
            throw new AppError(
              `code '${body.code}' already exists, or map+biome+sortOrder is already taken`,
              409,
            );
          }
          throw err;
        });
      const created = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Biome region ${created.code} created (${body.mapCode} / ${body.biomeCode}, ${body.shape})`,
        reason: body.reason,
        impact: body.impact,
        entity: "map_biome_regions",
        entityId: created.id,
      });
      return { code: created.code, version };
    });
  },

  async update(
    code: string,
    body: UpdateMapBiomeRegionBody,
  ): Promise<{ code: string; version: string }> {
    const patchKeys = Object.keys(body).filter((k) => k !== "reason" && k !== "impact");
    if (patchKeys.length === 0) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: schema.mapBiomeRegions.id,
          mapId: schema.mapBiomeRegions.mapId,
          biomeId: schema.mapBiomeRegions.biomeId,
        })
        .from(schema.mapBiomeRegions)
        .where(eq(schema.mapBiomeRegions.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Biome region '${code}' not found`, 404);

      const patch = await toRow(tx, body);
      // Re-check the pairing against whichever side actually changed.
      const mapId = (patch.mapId as number | undefined) ?? row.mapId;
      const biomeId = (patch.biomeId as number | undefined) ?? row.biomeId;
      if (patch.mapId !== undefined || patch.biomeId !== undefined) {
        await assertBiomeBelongsToMap(
          tx,
          mapId,
          biomeId,
          body.mapCode ?? String(mapId),
          body.biomeCode ?? String(biomeId),
        );
      }

      await tx
        .update(schema.mapBiomeRegions)
        .set({ ...patch, updatedAt: new Date() } as never)
        .where(eq(schema.mapBiomeRegions.code, code));
      const version = await recordChange(tx, {
        change: `Biome region ${code} updated (${patchKeys.join(", ")})`,
        reason: body.reason,
        impact: body.impact,
        entity: "map_biome_regions",
        entityId: row.id,
      });
      return { code, version };
    });
  },

  async remove(
    code: string,
    body: DeleteMapBiomeRegionBody,
  ): Promise<{ code: string; version: string }> {
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.mapBiomeRegions.id })
        .from(schema.mapBiomeRegions)
        .where(eq(schema.mapBiomeRegions.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Biome region '${code}' not found`, 404);
      // Changelog first so the entityId still resolves, same as crudFactory.
      const version = await recordChange(tx, {
        change: `Biome region ${code} deleted`,
        reason: body.reason,
        impact: body.impact,
        entity: "map_biome_regions",
        entityId: row.id,
      });
      await tx.delete(schema.mapBiomeRegions).where(eq(schema.mapBiomeRegions.code, code));
      return { code, version };
    });
  },

  async batchCreate(
    body: BatchCreateMapBiomeRegionsBody,
  ): Promise<{ codes: string[]; version: string }> {
    return db.transaction(async (tx) => {
      const codes: string[] = [];
      for (const item of body.items) {
        const row = await toRow(tx, item);
        await assertBiomeBelongsToMap(
          tx,
          row.mapId as number,
          row.biomeId as number,
          item.mapCode,
          item.biomeCode,
        );
        await tx
          .insert(schema.mapBiomeRegions)
          .values(row as never)
          .catch((err) => {
            if (isUniqueViolation(err)) {
              throw new AppError(
                `code '${item.code}' already exists, or map+biome+sortOrder is already taken`,
                409,
              );
            }
            throw err;
          });
        codes.push(item.code);
      }
      const version = await recordChange(tx, {
        change: `${codes.length} biome regions created in batch (${codes.join(", ")})`,
        reason: body.reason,
        impact: body.impact,
        entity: "map_biome_regions",
      });
      return { codes, version };
    });
  },
};
