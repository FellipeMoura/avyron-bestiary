import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import type {
  BatchCreateMissionsBody,
  CreateMissionBody,
  UpdateMissionBody,
} from "./MissionsTypes";
import { MISSION_FIELDS } from "./MissionsTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function resolveMap(tx: Tx, code: string | null | undefined) {
  return code ? resolveCodeInTx(tx, schema.gameMaps, code, "mapCode") : null;
}
async function resolveNpc(tx: Tx, code: string | null | undefined) {
  return code ? resolveCodeInTx(tx, schema.npcs, code, "npcCode") : null;
}

export const missionsService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    mapCode?: string;
    npcCode?: string;
    type?: string;
  }) {
    const fields = parseFields(params.fields, MISSION_FIELDS);
    const projection = buildProjection(
      schema.missions as unknown as Record<string, unknown>,
      fields,
    );
    const [mapId, npcId] = await Promise.all([
      resolveOptionalCode(schema.gameMaps, params.mapCode, "mapCode"),
      resolveOptionalCode(schema.npcs, params.npcCode, "npcCode"),
    ]);
    const filters = [];
    if (mapId !== null) filters.push(eq(schema.missions.mapId, mapId));
    if (npcId !== null) filters.push(eq(schema.missions.npcId, npcId));
    if (params.type) filters.push(eq(schema.missions.type, params.type));
    const q = projection
      ? db.select(projection).from(schema.missions)
      : db.select().from(schema.missions);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.missions.code))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getByCode(code: string) {
    const rows = await db
      .select()
      .from(schema.missions)
      .where(eq(schema.missions.code, code))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`Mission '${code}' not found`, 404);
    return row;
  },

  async create(body: CreateMissionBody) {
    const { reason, impact, mapCode, npcCode, ...rest } = body;
    return db.transaction(async (tx) => {
      const [mapId, npcId] = await Promise.all([resolveMap(tx, mapCode), resolveNpc(tx, npcCode)]);
      const inserted = await tx
        .insert(schema.missions)
        .values({ ...rest, mapId, npcId })
        .returning({ id: schema.missions.id, code: schema.missions.code })
        .catch((err) => {
          if (isUniqueViolation(err)) throw new AppError(`code: '${rest.code}' already exists`, 409);
          throw err;
        });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Mission ${row.code} created (${rest.name})`,
        reason,
        impact,
        entity: "missions",
        entityId: row.id,
      });
      return { code: row.code, version };
    });
  },

  async update(code: string, body: UpdateMissionBody) {
    const { reason, impact, mapCode, npcCode, ...patch } = body;
    const hasMap = "mapCode" in body;
    const hasNpc = "npcCode" in body;
    if (Object.keys(patch).length === 0 && !hasMap && !hasNpc) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.missions.id })
        .from(schema.missions)
        .where(eq(schema.missions.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Mission '${code}' not found`, 404);

      const updates: Partial<typeof schema.missions.$inferInsert> = { ...patch };
      if (hasMap) updates.mapId = await resolveMap(tx, mapCode);
      if (hasNpc) updates.npcId = await resolveNpc(tx, npcCode);

      await tx
        .update(schema.missions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.missions.code, code));
      const version = await recordChange(tx, {
        change: `Mission ${code} updated (${Object.keys(updates).join(", ")})`,
        reason,
        impact,
        entity: "missions",
        entityId: row.id,
      });
      return { code, version };
    });
  },

  async batchCreate(body: BatchCreateMissionsBody) {
    const { reason, impact, items } = body;
    return db.transaction(async (tx) => {
      const rows = await Promise.all(
        items.map(async ({ mapCode, npcCode, ...rest }) => ({
          ...rest,
          mapId: await resolveMap(tx, mapCode),
          npcId: await resolveNpc(tx, npcCode),
        })),
      );
      const inserted = await tx
        .insert(schema.missions)
        .values(rows)
        .returning({ id: schema.missions.id, code: schema.missions.code })
        .catch((err) => {
          if (isUniqueViolation(err)) throw new AppError("code: one or more codes already exist", 409);
          throw err;
        });
      const codes = inserted.map((r) => r.code);
      const version = await recordChange(tx, {
        change: `${inserted.length} missions created in batch (${codes.join(", ")})`,
        reason,
        impact,
        entity: "missions",
      });
      return { codes, version };
    });
  },
};
