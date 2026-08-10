import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import type { BatchUpsertMiningRatesBody, UpsertMiningRateBody } from "./MiningRatesTypes";
import { MINING_RATE_FIELDS } from "./MiningRatesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface ResolvedClassRate {
  classId: number;
  biomeId: null;
  itemId: number;
  weight: number;
}

interface ResolvedBiomeRate {
  classId: null;
  biomeId: number;
  itemId: number;
  weight: number;
}

type ResolvedRate = ResolvedClassRate | ResolvedBiomeRate;

async function resolveRate(
  tx: Tx,
  item: { classCode?: string; biomeCode?: string; itemCode: string; weight: number },
): Promise<ResolvedRate> {
  const itemId = await resolveCodeInTx(tx, schema.items, item.itemCode, "itemCode");

  if (item.classCode) {
    const classId = await resolveCodeInTx(tx, schema.creatureClasses, item.classCode, "classCode");
    return { classId, biomeId: null, itemId, weight: item.weight };
  }

  const biomeId = await resolveCodeInTx(tx, schema.biomes, item.biomeCode!, "biomeCode");
  return { classId: null, biomeId, itemId, weight: item.weight };
}

async function upsertResolved(tx: Tx, resolved: ResolvedRate) {
  if (resolved.classId !== null) {
    const classId = resolved.classId;
    return tx
      .insert(schema.miningRates)
      .values(resolved)
      .onConflictDoUpdate({
        target: [schema.miningRates.classId, schema.miningRates.itemId],
        targetWhere: isNotNull(schema.miningRates.classId),
        set: { weight: resolved.weight, updatedAt: new Date() },
      })
      .returning({ id: schema.miningRates.id })
      .then((rows) => ({ id: rows[0]!.id, subjectLabel: `class classId=${classId}` }));
  }

  const biomeId = resolved.biomeId;
  return tx
    .insert(schema.miningRates)
    .values(resolved)
    .onConflictDoUpdate({
      target: [schema.miningRates.biomeId, schema.miningRates.itemId],
      targetWhere: isNotNull(schema.miningRates.biomeId),
      set: { weight: resolved.weight, updatedAt: new Date() },
    })
    .returning({ id: schema.miningRates.id })
    .then((rows) => ({ id: rows[0]!.id, subjectLabel: `biome biomeId=${biomeId}` }));
}

export const miningRatesService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    classCode?: string;
    biomeCode?: string;
    itemCode?: string;
  }) {
    const fields = parseFields(params.fields, MINING_RATE_FIELDS);
    const projection = buildProjection(schema.miningRates as unknown as Record<string, unknown>, fields);

    const [classId, biomeId, itemId] = await Promise.all([
      resolveOptionalCode(schema.creatureClasses, params.classCode, "classCode"),
      resolveOptionalCode(schema.biomes, params.biomeCode, "biomeCode"),
      resolveOptionalCode(schema.items, params.itemCode, "itemCode"),
    ]);

    const filters = [];
    if (classId !== null) filters.push(eq(schema.miningRates.classId, classId));
    if (biomeId !== null) filters.push(eq(schema.miningRates.biomeId, biomeId));
    if (itemId !== null) filters.push(eq(schema.miningRates.itemId, itemId));

    const q = projection
      ? db.select(projection).from(schema.miningRates)
      : db.select().from(schema.miningRates);

    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.miningRates.id))
      .limit(params.limit)
      .offset(params.offset);
  },

  async upsert(body: UpsertMiningRateBody) {
    return db.transaction(async (tx) => {
      const resolved = await resolveRate(tx, body);
      const { id, subjectLabel } = await upsertResolved(tx, resolved);
      const itemLabel = `item ${body.itemCode}`;
      const version = await recordChange(tx, {
        change: `Mining rate for ${subjectLabel} + ${itemLabel} set to weight=${body.weight}`,
        reason: body.reason,
        impact: body.impact,
        entity: "mining_rates",
        entityId: id,
      });
      return { id, version };
    });
  },

  async batchUpsert(body: BatchUpsertMiningRatesBody) {
    const { reason, impact, items } = body;
    return db.transaction(async (tx) => {
      const resolvedRows = await Promise.all(items.map((item) => resolveRate(tx, item)));
      const results = await Promise.all(resolvedRows.map((r) => upsertResolved(tx, r)));
      const ids = results.map((r) => r.id);
      const version = await recordChange(tx, {
        change: `${ids.length} mining rates upserted in batch`,
        reason,
        impact,
        entity: "mining_rates",
      });
      return { ids, version };
    });
  },
};
