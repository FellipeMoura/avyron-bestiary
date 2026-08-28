import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import type {
  BatchUpsertMapConnectionsBody,
  UpsertMapConnectionBody,
} from "./MapConnectionsTypes";
import { MAP_CONNECTION_FIELDS } from "./MapConnectionsTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface ConnectionInput {
  fromMapCode: string;
  toMapCode: string;
  requiredGlyphCode?: string | null;
  sortOrder?: number;
}

/**
 * Resolve the three codes of one crossing.
 *
 * The self-loop is rejected here as well as by the CHECK constraint: the DB
 * would answer with a raw 23514 and the offending map code nowhere in the
 * message, and this endpoint's whole contract is that a bad code names
 * itself.
 */
async function resolveConnection(tx: Tx, item: ConnectionInput) {
  const [fromMapId, toMapId] = await Promise.all([
    resolveCodeInTx(tx, schema.gameMaps, item.fromMapCode, "fromMapCode"),
    resolveCodeInTx(tx, schema.gameMaps, item.toMapCode, "toMapCode"),
  ]);
  if (fromMapId === toMapId) {
    throw new AppError(`fromMapCode/toMapCode: a map cannot connect to itself ('${item.fromMapCode}')`, 422);
  }
  const requiredGlyphId = item.requiredGlyphCode
    ? await resolveCodeInTx(tx, schema.glyphs, item.requiredGlyphCode, "requiredGlyphCode")
    : null;
  return { fromMapId, toMapId, requiredGlyphId, sortOrder: item.sortOrder ?? 0 };
}

export const mapConnectionsService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    fromMapCode?: string;
    toMapCode?: string;
    glyphCode?: string;
  }) {
    const fields = parseFields(params.fields, MAP_CONNECTION_FIELDS);
    const projection = buildProjection(
      schema.mapConnections as unknown as Record<string, unknown>,
      fields,
    );
    const [fromMapId, toMapId, glyphId] = await Promise.all([
      resolveOptionalCode(schema.gameMaps, params.fromMapCode, "fromMapCode"),
      resolveOptionalCode(schema.gameMaps, params.toMapCode, "toMapCode"),
      resolveOptionalCode(schema.glyphs, params.glyphCode, "glyphCode"),
    ]);
    const filters = [];
    if (fromMapId !== null) filters.push(eq(schema.mapConnections.fromMapId, fromMapId));
    if (toMapId !== null) filters.push(eq(schema.mapConnections.toMapId, toMapId));
    if (glyphId !== null) filters.push(eq(schema.mapConnections.requiredGlyphId, glyphId));
    const q = projection
      ? db.select(projection).from(schema.mapConnections)
      : db.select().from(schema.mapConnections);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.mapConnections.sortOrder), asc(schema.mapConnections.fromMapId))
      .limit(params.limit)
      .offset(params.offset);
  },

  async upsert(body: UpsertMapConnectionBody) {
    return db.transaction(async (tx) => {
      const resolved = await resolveConnection(tx, body);
      const inserted = await tx
        .insert(schema.mapConnections)
        .values(resolved)
        .onConflictDoUpdate({
          target: [schema.mapConnections.fromMapId, schema.mapConnections.toMapId],
          set: {
            requiredGlyphId: resolved.requiredGlyphId,
            sortOrder: resolved.sortOrder,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.mapConnections.id });
      const row = inserted[0]!;
      const gate = body.requiredGlyphCode
        ? `requires glyph ${body.requiredGlyphCode}`
        : "free passage";
      const version = await recordChange(tx, {
        change: `Map ${body.fromMapCode} connected to ${body.toMapCode} (${gate})`,
        reason: body.reason,
        impact: body.impact,
        entity: "map_connections",
        entityId: row.id,
      });
      return { id: row.id, version };
    });
  },

  async batchUpsert(body: BatchUpsertMapConnectionsBody) {
    return db.transaction(async (tx) => {
      const resolvedRows = [];
      // Sequential, like the child-upsert factory: a mid-batch bad code
      // should surface pointing at the offending row.
      for (const item of body.items) {
        resolvedRows.push(await resolveConnection(tx, item));
      }
      const inserted = await tx
        .insert(schema.mapConnections)
        .values(resolvedRows)
        .onConflictDoUpdate({
          target: [schema.mapConnections.fromMapId, schema.mapConnections.toMapId],
          // `excluded` is the proposed row — naming the table column here would
          // rewrite the old row with itself and silently ignore every existing
          // pair, which is the bug the junction batches already had once.
          set: {
            requiredGlyphId: sql`excluded.required_glyph_id`,
            sortOrder: sql`excluded.sort_order`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.mapConnections.id });
      const ids = inserted.map((r) => r.id);
      const version = await recordChange(tx, {
        change: `${inserted.length} map connections upserted in batch`,
        reason: body.reason,
        impact: body.impact,
        entity: "map_connections",
      });
      return { ids, version };
    });
  },
};
