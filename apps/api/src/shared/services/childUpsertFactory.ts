import { asc, eq } from "drizzle-orm";
import { db } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../AppError";
import { recordChange } from "./changelog";
import { resolveCodeInTx, resolveOptionalCode } from "./fkResolver";
import { buildProjection, parseFields } from "./query";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ChildUpsertOptions {
  /** The child table (creature_stats, ability_stats, capture_rules). */
  table: AnyTable;
  /** The parent table the child hangs off (creatures, abilities). */
  parentTable: AnyTable;
  /** Column on the child holding the parent id, e.g. `creatureStats.creatureId`. */
  parentIdColumn: AnyTable;
  /** Name of the parent id column in JS, e.g. "creatureId". */
  parentIdKey: string;
  /** Body field carrying the parent code, e.g. "creatureCode". */
  parentCodeField: string;
  /** Changelog `entity` value. */
  entityName: string;
  /** Human name for changelog messages ("Creature stats"). */
  humanName: string;
  /** Whitelist for `?fields=`. */
  allowedFields: readonly string[];
  /** Payload columns the caller may set (everything except reason/impact/parent code). */
  payloadKeys: readonly string[];
}

/**
 * Builds list/getByParentCode/upsert/batchUpsert for a table that is a 1:1
 * child of a parent identified by `code`.
 *
 * The three numbers tables (creature_stats, ability_stats, capture_rules)
 * share this exact shape: no code of their own, addressed by the parent's
 * code, and written with upsert semantics — an agent expresses "the stats
 * changed" by POSTing again, exactly like `drops`. Writing them out three
 * times would have been ~600 lines of near-identical Service code.
 *
 * Junction tables with a two-part natural key (creature_abilities) do NOT
 * use this — they resolve two codes and are written by hand.
 */
export function createChildUpsertService(opts: ChildUpsertOptions) {
  const {
    table,
    parentTable,
    parentIdColumn,
    parentIdKey,
    parentCodeField,
    entityName,
    humanName,
    allowedFields,
    payloadKeys,
  } = opts;

  function pickPayload(body: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of payloadKeys) {
      if (body[k] !== undefined) out[k] = body[k];
    }
    return out;
  }

  /**
   * Columns to overwrite on conflict. Only the keys the caller actually sent
   * — a partial POST tunes one number without resetting the others to their
   * defaults, which is what makes iterative balancing bearable.
   */
  function conflictSet(payload: Record<string, unknown>): Record<string, unknown> {
    return { ...payload, updatedAt: new Date() };
  }

  return {
    async list(params: { limit: number; offset: number; fields?: string; parentCode?: string }) {
      const fields = parseFields(params.fields, allowedFields);
      const projection = buildProjection(table as Record<string, unknown>, fields);
      const parentId = await resolveOptionalCode(parentTable, params.parentCode, parentCodeField);
      const q = projection ? db.select(projection).from(table) : db.select().from(table);
      return q
        .where(parentId !== null ? eq(parentIdColumn, parentId) : undefined)
        .orderBy(asc(parentIdColumn))
        .limit(params.limit)
        .offset(params.offset);
    },

    async getByParentCode(code: string) {
      const parentId = await resolveOptionalCode(parentTable, code, parentCodeField);
      const rows = await db.select().from(table).where(eq(parentIdColumn, parentId)).limit(1);
      const row = rows[0];
      if (!row) throw new AppError(`${humanName} for '${code}' not found`, 404);
      return row;
    },

    async upsert(
      body: Record<string, unknown> & { reason: string; impact: string },
    ): Promise<{ code: string; version: string }> {
      const parentCode = String(body[parentCodeField]);
      const payload = pickPayload(body);
      return db.transaction(async (tx: Tx) => {
        const parentId = await resolveCodeInTx(tx, parentTable, parentCode, parentCodeField);
        const inserted = await tx
          .insert(table)
          .values({ [parentIdKey]: parentId, ...payload })
          .onConflictDoUpdate({ target: parentIdColumn, set: conflictSet(payload) })
          .returning({ id: table.id });
        const row = inserted[0]!;
        const version = await recordChange(tx, {
          change: `${humanName} for ${parentCode} set (${Object.keys(payload).join(", ")})`,
          reason: body.reason,
          impact: body.impact,
          entity: entityName,
          entityId: row.id,
        });
        return { code: parentCode, version };
      });
    },

    async batchUpsert(body: {
      items: Record<string, unknown>[];
      reason: string;
      impact: string;
    }): Promise<{ codes: string[]; version: string }> {
      const { reason, impact, items } = body;
      return db.transaction(async (tx: Tx) => {
        const codes: string[] = [];
        // Sequential rather than Promise.all: each row is its own upsert and
        // a mid-batch FK failure should surface with the offending code, not
        // as a race between parallel statements on the same transaction.
        for (const item of items) {
          const parentCode = String(item[parentCodeField]);
          const parentId = await resolveCodeInTx(tx, parentTable, parentCode, parentCodeField);
          const payload = pickPayload(item);
          await tx
            .insert(table)
            .values({ [parentIdKey]: parentId, ...payload })
            .onConflictDoUpdate({ target: parentIdColumn, set: conflictSet(payload) });
          codes.push(parentCode);
        }
        const version = await recordChange(tx, {
          change: `${codes.length} ${humanName.toLowerCase()} rows upserted in batch`,
          reason,
          impact,
          entity: entityName,
        });
        return { codes, version };
      });
    },
  };
}
