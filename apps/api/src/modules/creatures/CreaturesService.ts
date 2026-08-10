import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { buildProjection, parseFields } from "../../shared/services/query";
import {
  CREATURE_FIELDS,
  type BatchCreateCreaturesBody,
  type CreateCreatureBody,
  type UpdateCreatureBody,
} from "./CreaturesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface ListParams {
  limit: number;
  offset: number;
  fields?: string;
  era?: "paleozoic" | "mesozoic" | "cenozoic";
  classCode?: string;
  elementCode?: string;
  mapCode?: string;
  biomeCode?: string;
}

export const creaturesService = {
  async list(params: ListParams) {
    const fields = parseFields(params.fields, CREATURE_FIELDS);
    const projection = buildProjection(
      schema.creatures as unknown as Record<string, unknown>,
      fields,
    );

    const [classId, elementId, mapId, biomeId] = await Promise.all([
      resolveIfProvided(schema.creatureClasses, params.classCode, "classCode"),
      resolveIfProvided(schema.elements, params.elementCode, "elementCode"),
      resolveIfProvided(schema.gameMaps, params.mapCode, "mapCode"),
      resolveIfProvided(schema.biomes, params.biomeCode, "biomeCode"),
    ]);

    const filters = [];
    if (classId !== null) filters.push(eq(schema.creatures.classId, classId));
    if (elementId !== null) filters.push(eq(schema.creatures.elementId, elementId));
    if (mapId !== null) filters.push(eq(schema.creatures.mapId, mapId));
    if (biomeId !== null) filters.push(eq(schema.creatures.biomeId, biomeId));

    // Era filter joins through game_maps.
    if (params.era) {
      const mapsInEra = await db
        .select({ id: schema.gameMaps.id })
        .from(schema.gameMaps)
        .where(eq(schema.gameMaps.era, params.era));
      const ids = mapsInEra.map((m) => m.id);
      if (ids.length === 0) return [];
      // small helper: inArray import kept local to avoid re-import churn if unused
      const { inArray } = await import("drizzle-orm");
      filters.push(inArray(schema.creatures.mapId, ids));
    }

    const q = projection
      ? db.select(projection).from(schema.creatures)
      : db.select().from(schema.creatures);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.creatures.code))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getByCode(code: string) {
    const rows = await db
      .select()
      .from(schema.creatures)
      .where(eq(schema.creatures.code, code))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`Creature '${code}' not found`, 404);
    return row;
  },

  async create(body: CreateCreatureBody): Promise<{ code: string; version: string }> {
    return db.transaction(async (tx) => {
      const data = await resolveCreatureRefs(tx, body);
      const inserted = await tx
        .insert(schema.creatures)
        .values(data)
        .returning({ id: schema.creatures.id, code: schema.creatures.code })
        .catch((err) => {
          if (isUniqueViolation(err)) {
            throw new AppError(`code: '${body.code}' already exists`, 409);
          }
          throw err;
        });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Creature ${row.code} created (${body.originalName})`,
        reason: body.reason,
        impact: body.impact,
        entity: "creatures",
        entityId: row.id,
      });
      return { code: row.code, version };
    });
  },

  async update(
    code: string,
    body: UpdateCreatureBody,
  ): Promise<{ code: string; version: string }> {
    const { reason, impact, ...patchInput } = body;
    const patchKeys = Object.keys(patchInput);
    if (patchKeys.length === 0) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.creatures.id })
        .from(schema.creatures)
        .where(eq(schema.creatures.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Creature '${code}' not found`, 404);

      const patch = await resolvePartialCreatureRefs(tx, patchInput);
      await tx
        .update(schema.creatures)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.creatures.code, code));

      const version = await recordChange(tx, {
        change: `Creature ${code} updated (${patchKeys.join(", ")})`,
        reason,
        impact,
        entity: "creatures",
        entityId: row.id,
      });
      return { code, version };
    });
  },

  /**
   * Removes a creature and everything hanging off it — awakening, stats,
   * capture rule, ability links and drops all cascade. Used when a species
   * falls out of scope, which is a design decision, not a data fix, so it
   * carries the usual reason/impact and lands in the changelog.
   *
   * The changelog row is written before the DELETE so it keeps the entityId
   * reference; `changelog.entityId` is deliberately not a foreign key, so
   * the history of a removed creature survives its removal.
   */
  async remove(
    code: string,
    body: { reason: string; impact: string },
  ): Promise<{ code: string; version: string }> {
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.creatures.id, originalName: schema.creatures.originalName })
        .from(schema.creatures)
        .where(eq(schema.creatures.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Creature '${code}' not found`, 404);

      const version = await recordChange(tx, {
        change: `Creature ${code} deleted (${row.originalName})`,
        reason: body.reason,
        impact: body.impact,
        entity: "creatures",
        entityId: row.id,
      });
      await tx.delete(schema.creatures).where(eq(schema.creatures.code, code));
      return { code, version };
    });
  },

  async batchCreate(
    body: BatchCreateCreaturesBody,
  ): Promise<{ codes: string[]; version: string }> {
    return db.transaction(async (tx) => {
      const rows = await Promise.all(body.items.map((item) => resolveCreatureRefs(tx, item)));
      const inserted = await tx
        .insert(schema.creatures)
        .values(rows)
        .returning({ id: schema.creatures.id, code: schema.creatures.code })
        .catch((err) => {
          if (isUniqueViolation(err)) {
            throw new AppError("code: one or more codes already exist", 409);
          }
          throw err;
        });
      const codes = inserted.map((r) => r.code);
      const version = await recordChange(tx, {
        change: `${inserted.length} creatures created in batch (${codes.join(", ")})`,
        reason: body.reason,
        impact: body.impact,
        entity: "creatures",
      });
      return { codes, version };
    });
  },
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;

async function resolveIfProvided(
  table: AnyTable,
  code: string | undefined,
  paramName: string,
): Promise<number | null> {
  if (!code) return null;
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.code, code))
    .limit(1);
  if (rows.length === 0) {
    throw new AppError(`${paramName}: '${code}' does not exist`, 422);
  }
  return rows[0]!.id;
}

async function resolveCodeInTx(
  tx: Tx,
  table: AnyTable,
  code: string,
  field: string,
): Promise<number> {
  const rows = await tx
    .select({ id: table.id })
    .from(table)
    .where(eq(table.code, code))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError(`${field}: '${code}' does not exist`, 422);
  return row.id;
}

async function resolveCreatureRefs(
  tx: Tx,
  body: Omit<CreateCreatureBody, "reason" | "impact">,
): Promise<typeof schema.creatures.$inferInsert> {
  const [classId, elementId] = await Promise.all([
    resolveCodeInTx(tx, schema.creatureClasses, body.classCode, "classCode"),
    resolveCodeInTx(tx, schema.elements, body.elementCode, "elementCode"),
  ]);
  const mapId = body.mapCode
    ? await resolveCodeInTx(tx, schema.gameMaps, body.mapCode, "mapCode")
    : null;
  const biomeId = body.biomeCode
    ? await resolveCodeInTx(tx, schema.biomes, body.biomeCode, "biomeCode")
    : null;
  return {
    code: body.code,
    originalName: body.originalName,
    baseSpecies: body.baseSpecies ?? null,
    classId,
    elementId,
    mapId,
    biomeId,
    role: body.role ?? null,
    silhouetteNote: body.silhouetteNote ?? null,
    status: body.status ?? null,
    modelUrl: body.modelUrl ?? null,
  };
}

async function resolvePartialCreatureRefs(
  tx: Tx,
  patch: Partial<Omit<CreateCreatureBody, "reason" | "impact">>,
): Promise<Partial<typeof schema.creatures.$inferInsert>> {
  const out: Partial<typeof schema.creatures.$inferInsert> = {};
  if (patch.code !== undefined) out.code = patch.code;
  if (patch.originalName !== undefined) out.originalName = patch.originalName;
  if (patch.baseSpecies !== undefined) out.baseSpecies = patch.baseSpecies ?? null;
  if (patch.role !== undefined) out.role = patch.role ?? null;
  if (patch.silhouetteNote !== undefined) out.silhouetteNote = patch.silhouetteNote ?? null;
  if (patch.status !== undefined) out.status = patch.status ?? null;
  if (patch.modelUrl !== undefined) out.modelUrl = patch.modelUrl ?? null;
  if (patch.classCode !== undefined) {
    out.classId = await resolveCodeInTx(tx, schema.creatureClasses, patch.classCode, "classCode");
  }
  if (patch.elementCode !== undefined) {
    out.elementId = await resolveCodeInTx(tx, schema.elements, patch.elementCode, "elementCode");
  }
  if (patch.mapCode !== undefined) {
    out.mapId = patch.mapCode
      ? await resolveCodeInTx(tx, schema.gameMaps, patch.mapCode, "mapCode")
      : null;
  }
  if (patch.biomeCode !== undefined) {
    out.biomeId = patch.biomeCode
      ? await resolveCodeInTx(tx, schema.biomes, patch.biomeCode, "biomeCode")
      : null;
  }
  return out;
}
