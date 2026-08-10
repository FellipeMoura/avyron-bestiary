import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import type { BatchUpsertDropsBody, UpsertDropBody } from "./DropsTypes";
import { DROP_FIELDS } from "./DropsTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface ResolvedDrop {
  creatureId: number;
  itemId: number;
  chance: number;
  condition: string | null;
}

async function resolveDrop(
  tx: Tx,
  item: { creatureCode: string; itemCode: string; chance: number; condition?: string | null },
): Promise<ResolvedDrop> {
  const [creatureId, itemId] = await Promise.all([
    resolveCodeInTx(tx, schema.creatures, item.creatureCode, "creatureCode"),
    resolveCodeInTx(tx, schema.items, item.itemCode, "itemCode"),
  ]);
  return { creatureId, itemId, chance: item.chance, condition: item.condition ?? null };
}

export const dropsService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    creatureCode?: string;
    itemCode?: string;
  }) {
    const fields = parseFields(params.fields, DROP_FIELDS);
    const projection = buildProjection(schema.drops as unknown as Record<string, unknown>, fields);
    const [creatureId, itemId] = await Promise.all([
      resolveOptionalCode(schema.creatures, params.creatureCode, "creatureCode"),
      resolveOptionalCode(schema.items, params.itemCode, "itemCode"),
    ]);
    const filters = [];
    if (creatureId !== null) filters.push(eq(schema.drops.creatureId, creatureId));
    if (itemId !== null) filters.push(eq(schema.drops.itemId, itemId));
    const q = projection ? db.select(projection).from(schema.drops) : db.select().from(schema.drops);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.drops.id))
      .limit(params.limit)
      .offset(params.offset);
  },

  async upsert(body: UpsertDropBody) {
    return db.transaction(async (tx) => {
      const resolved = await resolveDrop(tx, body);
      const inserted = await tx
        .insert(schema.drops)
        .values(resolved)
        .onConflictDoUpdate({
          target: [schema.drops.creatureId, schema.drops.itemId, schema.drops.condition],
          set: { chance: resolved.chance, updatedAt: new Date() },
        })
        .returning({ id: schema.drops.id });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Drop for creature ${body.creatureCode} + item ${body.itemCode} set to chance=${body.chance}`,
        reason: body.reason,
        impact: body.impact,
        entity: "drops",
        entityId: row.id,
      });
      return { id: row.id, version };
    });
  },

  async batchUpsert(body: BatchUpsertDropsBody) {
    const { reason, impact, items } = body;
    return db.transaction(async (tx) => {
      const resolvedRows = await Promise.all(items.map((item) => resolveDrop(tx, item)));
      const inserted = await tx
        .insert(schema.drops)
        .values(resolvedRows)
        .onConflictDoUpdate({
          target: [schema.drops.creatureId, schema.drops.itemId, schema.drops.condition],
          set: { chance: schema.drops.chance, updatedAt: new Date() },
        })
        .returning({ id: schema.drops.id });
      const ids = inserted.map((r) => r.id);
      const version = await recordChange(tx, {
        change: `${inserted.length} drops upserted in batch`,
        reason,
        impact,
        entity: "drops",
      });
      return { ids, version };
    });
  },
};
