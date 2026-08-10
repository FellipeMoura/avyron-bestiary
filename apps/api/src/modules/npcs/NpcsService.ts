import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import type { BatchCreateNpcsBody, CreateNpcBody, UpdateNpcBody } from "./NpcsTypes";
import { NPC_FIELDS } from "./NpcsTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function resolveMap(tx: Tx, code: string | null | undefined): Promise<number | null> {
  if (!code) return null;
  return resolveCodeInTx(tx, schema.gameMaps, code, "mapCode");
}

export const npcsService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    mapCode?: string;
    faction?: string;
    role?: (typeof schema.npcs.$inferSelect)["role"];
  }) {
    const fields = parseFields(params.fields, NPC_FIELDS);
    const projection = buildProjection(schema.npcs as unknown as Record<string, unknown>, fields);
    const mapId = await resolveOptionalCode(schema.gameMaps, params.mapCode, "mapCode");
    const filters = [];
    if (mapId !== null) filters.push(eq(schema.npcs.mapId, mapId));
    if (params.faction) filters.push(eq(schema.npcs.faction, params.faction));
    // Filtrar por papel é o que deixa o export pegar só os comerciantes sem
    // trazer o vilarejo inteiro.
    if (params.role) filters.push(eq(schema.npcs.role, params.role));
    const q = projection ? db.select(projection).from(schema.npcs) : db.select().from(schema.npcs);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.npcs.code))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getByCode(code: string) {
    const rows = await db.select().from(schema.npcs).where(eq(schema.npcs.code, code)).limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`NPC '${code}' not found`, 404);
    return row;
  },

  async create(body: CreateNpcBody) {
    const { reason, impact, mapCode, ...rest } = body;
    return db.transaction(async (tx) => {
      const mapId = await resolveMap(tx, mapCode);
      const inserted = await tx
        .insert(schema.npcs)
        .values({ ...rest, mapId })
        .returning({ id: schema.npcs.id, code: schema.npcs.code })
        .catch((err) => {
          if (isUniqueViolation(err)) throw new AppError(`code: '${rest.code}' already exists`, 409);
          throw err;
        });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `NPC ${row.code} created (${rest.name})`,
        reason,
        impact,
        entity: "npcs",
        entityId: row.id,
      });
      return { code: row.code, version };
    });
  },

  async update(code: string, body: UpdateNpcBody) {
    const { reason, impact, mapCode, ...patch } = body;
    const hasMapUpdate = "mapCode" in body;
    if (Object.keys(patch).length === 0 && !hasMapUpdate) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.npcs.id })
        .from(schema.npcs)
        .where(eq(schema.npcs.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`NPC '${code}' not found`, 404);

      const updates: Partial<typeof schema.npcs.$inferInsert> = { ...patch };
      if (hasMapUpdate) updates.mapId = await resolveMap(tx, mapCode);

      await tx
        .update(schema.npcs)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.npcs.code, code));
      const version = await recordChange(tx, {
        change: `NPC ${code} updated (${Object.keys(updates).join(", ")})`,
        reason,
        impact,
        entity: "npcs",
        entityId: row.id,
      });
      return { code, version };
    });
  },

  async batchCreate(body: BatchCreateNpcsBody) {
    const { reason, impact, items } = body;
    return db.transaction(async (tx) => {
      const rows = await Promise.all(
        items.map(async ({ mapCode, ...rest }) => ({
          ...rest,
          mapId: await resolveMap(tx, mapCode),
        })),
      );
      const inserted = await tx
        .insert(schema.npcs)
        .values(rows)
        .returning({ id: schema.npcs.id, code: schema.npcs.code })
        .catch((err) => {
          if (isUniqueViolation(err)) throw new AppError("code: one or more codes already exist", 409);
          throw err;
        });
      const codes = inserted.map((r) => r.code);
      const version = await recordChange(tx, {
        change: `${inserted.length} npcs created in batch (${codes.join(", ")})`,
        reason,
        impact,
        entity: "npcs",
      });
      return { codes, version };
    });
  },
};
