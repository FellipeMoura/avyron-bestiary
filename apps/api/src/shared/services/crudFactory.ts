import { asc, eq, sql } from "drizzle-orm";
import { db } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../AppError";
import { recordChange } from "./changelog";
import { buildProjection, parseFields } from "./query";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface CrudFactoryOptions {
  /** The Drizzle table. Must have `id`, `code`, `updatedAt` columns. */
  table: AnyTable;
  /** Table name — used as the changelog `entity` value. */
  entityName: string;
  /** Human name used in changelog messages ("Element", "Biome"). */
  humanName: string;
  /** Whitelist of columns for `?fields=` — normally every column. */
  allowedFields: readonly string[];
  /**
   * Column used to summarize the row in the changelog message
   * ("Element ELE-006 created (Sombra)" — displayField is `name`).
   * Optional; if omitted, only the code is shown.
   */
  displayField?: string;
  /**
   * If set (e.g. "ELE"), `create` may be called without a `code` — the
   * factory then generates the next `${prefix}-NNN` inside the same
   * transaction. Uses `MAX(...) + 1` over the numeric suffix so gaps
   * left by deletes are not reused (predictable, agent-parseable).
   * Codes provided by the caller are always honored; auto-gen only
   * fires when `data.code` is missing.
   */
  codePrefix?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isFkViolation(err: any): boolean {
  return err?.code === "23503" || err?.cause?.code === "23503";
}

/**
 * Builds list/getByCode/create/update/remove/batchCreate for a resource
 * whose only writes are the row itself plus a changelog entry (no FK
 * resolution, no cross-table checks). Use this for elements, biomes,
 * items, etc.
 *
 * Resources with FK resolution (creatures, missions, drops...) or extra
 * invariants (awakenings 1-to-1) write their Service by hand.
 */
export function createSimpleCrudService(opts: CrudFactoryOptions) {
  const { table, entityName, humanName, allowedFields, displayField, codePrefix } = opts;

  function describe(code: string, data: Record<string, unknown> | null): string {
    if (!displayField || !data || data[displayField] === undefined) {
      return `${humanName} ${code}`;
    }
    return `${humanName} ${code} (${String(data[displayField])})`;
  }

  async function generateNextCode(tx: Tx, prefix: string): Promise<string> {
    const rows = await tx
      .select({
        max: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(${table.code}, '-', 2) AS INTEGER)), 0)`,
      })
      .from(table)
      .where(sql`${table.code} LIKE ${prefix + "-%"}`);
    const next = (rows[0]?.max ?? 0) + 1;
    return `${prefix}-${String(next).padStart(3, "0")}`;
  }

  return {
    async list(params: {
      limit: number;
      offset: number;
      fields?: string;
    }) {
      const fields = parseFields(params.fields, allowedFields);
      const projection = buildProjection(table as Record<string, unknown>, fields);
      const q = projection ? db.select(projection).from(table) : db.select().from(table);
      return q.orderBy(asc(table.code)).limit(params.limit).offset(params.offset);
    },

    async getByCode(code: string) {
      const rows = await db.select().from(table).where(eq(table.code, code)).limit(1);
      const row = rows[0];
      if (!row) throw new AppError(`${humanName} '${code}' not found`, 404);
      return row;
    },

    async create(
      body: Record<string, unknown> & { reason: string; impact: string; code?: string },
    ): Promise<{ code: string; version: string }> {
      const { reason, impact, ...data } = body;
      return db.transaction(async (tx: Tx) => {
        if (!data.code) {
          if (!codePrefix) {
            throw new AppError("code: required", 422);
          }
          data.code = await generateNextCode(tx, codePrefix);
        }
        const inserted = await tx
          .insert(table)
          .values(data)
          .returning({ id: table.id, code: table.code })
          .catch((err) => {
            if (isUniqueViolation(err)) {
              throw new AppError(`code: '${data.code}' already exists`, 409);
            }
            throw err;
          });
        const row = inserted[0]!;
        const version = await recordChange(tx, {
          change: `${describe(row.code, data)} created`,
          reason,
          impact,
          entity: entityName,
          entityId: row.id,
        });
        return { code: row.code, version };
      });
    },

    async update(
      code: string,
      body: Record<string, unknown> & { reason: string; impact: string },
    ): Promise<{ code: string; version: string }> {
      const { reason, impact, ...patch } = body;
      if (Object.keys(patch).length === 0) {
        throw new AppError("At least one field must be provided beyond reason/impact", 422);
      }
      return db.transaction(async (tx: Tx) => {
        const existing = await tx
          .select({ id: table.id })
          .from(table)
          .where(eq(table.code, code))
          .limit(1);
        const row = existing[0];
        if (!row) throw new AppError(`${humanName} '${code}' not found`, 404);

        await tx
          .update(table)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(table.code, code));
        const version = await recordChange(tx, {
          change: `${humanName} ${code} updated (${Object.keys(patch).join(", ")})`,
          reason,
          impact,
          entity: entityName,
          entityId: row.id,
        });
        return { code, version };
      });
    },

    async remove(
      code: string,
      body: { reason: string; impact: string },
    ): Promise<{ code: string; version: string }> {
      const { reason, impact } = body;
      return db.transaction(async (tx: Tx) => {
        const existing = await tx
          .select({ id: table.id })
          .from(table)
          .where(eq(table.code, code))
          .limit(1);
        const row = existing[0];
        if (!row) throw new AppError(`${humanName} '${code}' not found`, 404);

        // recordChange runs before the DELETE so the changelog row keeps the
        // entityId reference alive; on 23503 we let the outer transaction
        // roll it back together with the delete attempt.
        const version = await recordChange(tx, {
          change: `${humanName} ${code} deleted`,
          reason,
          impact,
          entity: entityName,
          entityId: row.id,
        });
        await tx
          .delete(table)
          .where(eq(table.code, code))
          .catch((err) => {
            if (isFkViolation(err)) {
              throw new AppError(
                `${humanName} '${code}' cannot be deleted: still referenced by other records`,
                409,
              );
            }
            throw err;
          });
        return { code, version };
      });
    },

    async batchCreate(body: {
      items: Record<string, unknown>[];
      reason: string;
      impact: string;
    }): Promise<{ codes: string[]; version: string }> {
      const { reason, impact, items } = body;
      return db.transaction(async (tx: Tx) => {
        const inserted = await tx
          .insert(table)
          .values(items)
          .returning({ id: table.id, code: table.code })
          .catch((err) => {
            if (isUniqueViolation(err)) {
              throw new AppError("code: one or more codes already exist", 409);
            }
            throw err;
          });
        const codes = inserted.map((r) => r.code);
        const version = await recordChange(tx, {
          change: `${inserted.length} ${humanName.toLowerCase()}s created in batch (${codes.join(", ")})`,
          reason,
          impact,
          entity: entityName,
        });
        return { codes, version };
      });
    },
  };
}
