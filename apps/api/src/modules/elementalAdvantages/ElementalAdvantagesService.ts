import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import type {
  BatchUpsertElementalAdvantagesBody,
  UpsertElementalAdvantageBody,
} from "./ElementalAdvantagesTypes";
import { ELEMENTAL_ADVANTAGE_FIELDS } from "./ElementalAdvantagesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function resolvePair(
  tx: Tx,
  item: { attackerCode: string; defenderCode: string; multiplier: number },
) {
  const [attackerElementId, defenderElementId] = await Promise.all([
    resolveCodeInTx(tx, schema.elements, item.attackerCode, "attackerCode"),
    resolveCodeInTx(tx, schema.elements, item.defenderCode, "defenderCode"),
  ]);
  return { attackerElementId, defenderElementId, multiplier: item.multiplier };
}

export const elementalAdvantagesService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    attackerCode?: string;
    defenderCode?: string;
  }) {
    const fields = parseFields(params.fields, ELEMENTAL_ADVANTAGE_FIELDS);
    const projection = buildProjection(
      schema.elementalAdvantages as unknown as Record<string, unknown>,
      fields,
    );
    const [attackerId, defenderId] = await Promise.all([
      resolveOptionalCode(schema.elements, params.attackerCode, "attackerCode"),
      resolveOptionalCode(schema.elements, params.defenderCode, "defenderCode"),
    ]);
    const filters = [];
    if (attackerId !== null)
      filters.push(eq(schema.elementalAdvantages.attackerElementId, attackerId));
    if (defenderId !== null)
      filters.push(eq(schema.elementalAdvantages.defenderElementId, defenderId));
    const q = projection
      ? db.select(projection).from(schema.elementalAdvantages)
      : db.select().from(schema.elementalAdvantages);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(
        asc(schema.elementalAdvantages.attackerElementId),
        asc(schema.elementalAdvantages.defenderElementId),
      )
      .limit(params.limit)
      .offset(params.offset);
  },

  async upsert(body: UpsertElementalAdvantageBody) {
    return db.transaction(async (tx) => {
      const resolved = await resolvePair(tx, body);
      const inserted = await tx
        .insert(schema.elementalAdvantages)
        .values(resolved)
        .onConflictDoUpdate({
          target: [
            schema.elementalAdvantages.attackerElementId,
            schema.elementalAdvantages.defenderElementId,
          ],
          set: { multiplier: resolved.multiplier, updatedAt: new Date() },
        })
        .returning({ id: schema.elementalAdvantages.id });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Elemental advantage ${body.attackerCode} vs ${body.defenderCode} set to x${body.multiplier}`,
        reason: body.reason,
        impact: body.impact,
        entity: "elemental_advantages",
        entityId: row.id,
      });
      return { id: row.id, version };
    });
  },

  async batchUpsert(body: BatchUpsertElementalAdvantagesBody) {
    return db.transaction(async (tx) => {
      const resolvedRows = await Promise.all(body.items.map((it) => resolvePair(tx, it)));
      const inserted = await tx
        .insert(schema.elementalAdvantages)
        .values(resolvedRows)
        .onConflictDoUpdate({
          target: [
            schema.elementalAdvantages.attackerElementId,
            schema.elementalAdvantages.defenderElementId,
          ],
          set: { multiplier: schema.elementalAdvantages.multiplier, updatedAt: new Date() },
        })
        .returning({ id: schema.elementalAdvantages.id });
      const ids = inserted.map((r) => r.id);
      const version = await recordChange(tx, {
        change: `${inserted.length} elemental advantages upserted in batch`,
        reason: body.reason,
        impact: body.impact,
        entity: "elemental_advantages",
      });
      return { ids, version };
    });
  },
};
