import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import type {
  BatchCreateAwakeningsBody,
  CreateAwakeningBody,
  UpdateAwakeningBody,
} from "./AwakeningsTypes";
import { AWAKENING_FIELDS } from "./AwakeningsTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function resolveCreature(tx: Tx, code: string): Promise<number> {
  return resolveCodeInTx(tx, schema.creatures, code, "creatureCode");
}

export const awakeningsService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    creatureCode?: string;
    type?: "reinforcement" | "swap";
  }) {
    const fields = parseFields(params.fields, AWAKENING_FIELDS);
    const projection = buildProjection(
      schema.awakenings as unknown as Record<string, unknown>,
      fields,
    );
    const creatureId = await resolveOptionalCode(
      schema.creatures,
      params.creatureCode,
      "creatureCode",
    );
    const filters = [];
    if (creatureId !== null) filters.push(eq(schema.awakenings.creatureId, creatureId));
    if (params.type) filters.push(eq(schema.awakenings.type, params.type));
    const q = projection
      ? db.select(projection).from(schema.awakenings)
      : db.select().from(schema.awakenings);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.awakenings.code))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getByCode(code: string) {
    const rows = await db
      .select()
      .from(schema.awakenings)
      .where(eq(schema.awakenings.code, code))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`Awakening '${code}' not found`, 404);
    return row;
  },

  async create(body: CreateAwakeningBody) {
    const { reason, impact, creatureCode, ...rest } = body;
    return db.transaction(async (tx) => {
      const creatureId = await resolveCreature(tx, creatureCode);
      const inserted = await tx
        .insert(schema.awakenings)
        .values({ ...rest, creatureId })
        .returning({ id: schema.awakenings.id, code: schema.awakenings.code })
        .catch((err) => {
          if (isUniqueViolation(err)) {
            // Could be duplicate code OR duplicate creatureId — check both.
            throw new AppError(
              `Duplicate: either code '${rest.code}' exists, or creature '${creatureCode}' already has an awakening (1-to-1)`,
              409,
            );
          }
          throw err;
        });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Awakening ${row.code} created for creature ${creatureCode} (${rest.name})`,
        reason,
        impact,
        entity: "awakenings",
        entityId: row.id,
      });
      return { code: row.code, version };
    });
  },

  async update(code: string, body: UpdateAwakeningBody) {
    const { reason, impact, creatureCode, ...patch } = body;
    const hasCreature = "creatureCode" in body;
    if (Object.keys(patch).length === 0 && !hasCreature) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.awakenings.id })
        .from(schema.awakenings)
        .where(eq(schema.awakenings.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Awakening '${code}' not found`, 404);

      const updates: Partial<typeof schema.awakenings.$inferInsert> = { ...patch };
      if (hasCreature && creatureCode) {
        updates.creatureId = await resolveCreature(tx, creatureCode);
      }

      await tx
        .update(schema.awakenings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.awakenings.code, code))
        .catch((err) => {
          if (isUniqueViolation(err)) {
            throw new AppError(
              `Duplicate: creature '${creatureCode}' already has an awakening (1-to-1)`,
              409,
            );
          }
          throw err;
        });
      const version = await recordChange(tx, {
        change: `Awakening ${code} updated (${Object.keys(updates).join(", ")})`,
        reason,
        impact,
        entity: "awakenings",
        entityId: row.id,
      });
      return { code, version };
    });
  },

  async batchCreate(body: BatchCreateAwakeningsBody) {
    const { reason, impact, items } = body;
    return db.transaction(async (tx) => {
      const rows = await Promise.all(
        items.map(async ({ creatureCode, ...rest }) => ({
          ...rest,
          creatureId: await resolveCreature(tx, creatureCode),
        })),
      );
      const inserted = await tx
        .insert(schema.awakenings)
        .values(rows)
        .returning({ id: schema.awakenings.id, code: schema.awakenings.code })
        .catch((err) => {
          if (isUniqueViolation(err)) {
            throw new AppError(
              "Duplicate: one or more codes exist, or a creature already has an awakening",
              409,
            );
          }
          throw err;
        });
      const codes = inserted.map((r) => r.code);
      const version = await recordChange(tx, {
        change: `${inserted.length} awakenings created in batch (${codes.join(", ")})`,
        reason,
        impact,
        entity: "awakenings",
      });
      return { codes, version };
    });
  },
};
