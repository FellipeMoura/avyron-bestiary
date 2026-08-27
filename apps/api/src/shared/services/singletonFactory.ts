import { eq } from "drizzle-orm";
import { db } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../AppError";
import { recordChange } from "./changelog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Every rules table pins its single row at this id, guarded by a CHECK. */
const SINGLETON_ID = 1;

export interface SingletonServiceOptions {
  /** The rules table (combat_rules, economy_rules, ...). */
  table: AnyTable;
  /** The table's `id` column, e.g. `combatRules.id`. */
  idColumn: AnyTable;
  /** Changelog `entity` value, e.g. "combat_rules". */
  entityName: string;
  /** Human name for changelog and 404 text ("Combat rules"). */
  humanName: string;
  /** Columns a PATCH may write (everything except reason/impact). */
  payloadKeys: readonly string[];
  /**
   * Pairs that must stay ordered `min <= max`, validated against the row as
   * it will look after the patch.
   *
   * The database CHECKs the same pairs, but a constraint violation names the
   * constraint, not the field the caller got wrong. Validating here lets the
   * 422 say `damageVarianceMin (0.9) cannot exceed damageVarianceMax (0.7)`.
   *
   * Declarative on purpose: all four rules tables need only this one kind of
   * cross-field rule. A table that ever needs something else should drop the
   * factory and be written by hand rather than grow a callback here.
   */
  orderedPairs?: readonly (readonly [string, string])[];
}

/**
 * Builds get/update for a singleton rules table — one row, no code, no list,
 * no POST, addressed as the resource itself and tuned with PATCH.
 *
 * The four tuning tables (combat_rules, progression_rules, economy_rules,
 * relic_rules) share this shape exactly. Written out four times it was ~340
 * lines of Service that had to change together and, in practice, didn't.
 */
export function createSingletonService(opts: SingletonServiceOptions) {
  const { table, idColumn, entityName, humanName, payloadKeys, orderedPairs = [] } = opts;

  /**
   * Creates the single row with the schema defaults if it is missing.
   *
   * Preferred over seeding from the migration: a freshly created dev database,
   * a partial restore or a `db:pull` that did not bring the table would be left
   * without the row, and the symptom would be the game running with no tuning
   * constants at all. This way the first read repairs it.
   */
  async function ensureRow(tx: Tx): Promise<void> {
    const existing = await tx
      .select({ id: idColumn })
      .from(table)
      .where(eq(idColumn, SINGLETON_ID))
      .limit(1);
    if (existing.length === 0) {
      await tx.insert(table).values({ id: SINGLETON_ID }).onConflictDoNothing();
    }
  }

  async function readRow(tx: Tx): Promise<Record<string, unknown>> {
    const rows = await tx.select().from(table).where(eq(idColumn, SINGLETON_ID)).limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`${humanName.toLowerCase()} not found`, 404);
    return row as Record<string, unknown>;
  }

  return {
    async get() {
      return db.transaction(async (tx) => {
        await ensureRow(tx);
        return readRow(tx);
      });
    },

    async update(body: Record<string, unknown>): Promise<{ version: string }> {
      const reason = body.reason as string;
      const impact = body.impact as string;

      const patch: Record<string, unknown> = {};
      for (const key of payloadKeys) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      if (Object.keys(patch).length === 0) {
        throw new AppError("At least one field must be provided beyond reason/impact", 422);
      }

      return db.transaction(async (tx) => {
        await ensureRow(tx);

        if (orderedPairs.length > 0) {
          const merged = { ...(await readRow(tx)), ...patch };
          for (const [minKey, maxKey] of orderedPairs) {
            const min = merged[minKey] as number;
            const max = merged[maxKey] as number;
            if (min > max) {
              throw new AppError(`${minKey} (${min}) cannot exceed ${maxKey} (${max})`, 422);
            }
          }
        }

        await tx
          .update(table)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(idColumn, SINGLETON_ID));

        const version = await recordChange(tx, {
          change: `${humanName} updated (${Object.keys(patch).join(", ")})`,
          reason,
          impact,
          entity: entityName,
          entityId: SINGLETON_ID,
        });
        return { version };
      });
    },
  };
}
