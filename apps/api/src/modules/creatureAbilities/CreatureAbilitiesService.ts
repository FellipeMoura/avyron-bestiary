import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import { CREATURE_ABILITY_FIELDS } from "./CreatureAbilitiesTypes";
import type {
  BatchUpsertCreatureAbilitiesBody,
  UpsertCreatureAbilityBody,
} from "./CreatureAbilitiesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface ResolvedLink {
  creatureId: number;
  abilityId: number;
  learnLevel: number;
  sortOrder: number;
}

async function resolveLink(
  tx: Tx,
  item: { creatureCode: string; abilityCode: string; learnLevel?: number; sortOrder?: number },
): Promise<ResolvedLink> {
  const [creatureId, abilityId] = await Promise.all([
    resolveCodeInTx(tx, schema.creatures, item.creatureCode, "creatureCode"),
    resolveCodeInTx(tx, schema.abilities, item.abilityCode, "abilityCode"),
  ]);
  return {
    creatureId,
    abilityId,
    learnLevel: item.learnLevel ?? 1,
    sortOrder: item.sortOrder ?? 0,
  };
}

export const creatureAbilitiesService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    creatureCode?: string;
    abilityCode?: string;
  }) {
    const fields = parseFields(params.fields, CREATURE_ABILITY_FIELDS);
    const projection = buildProjection(
      schema.creatureAbilities as unknown as Record<string, unknown>,
      fields,
    );
    const [creatureId, abilityId] = await Promise.all([
      resolveOptionalCode(schema.creatures, params.creatureCode, "creatureCode"),
      resolveOptionalCode(schema.abilities, params.abilityCode, "abilityCode"),
    ]);
    const filters = [];
    if (creatureId !== null) filters.push(eq(schema.creatureAbilities.creatureId, creatureId));
    if (abilityId !== null) filters.push(eq(schema.creatureAbilities.abilityId, abilityId));
    const q = projection
      ? db.select(projection).from(schema.creatureAbilities)
      : db.select().from(schema.creatureAbilities);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.creatureAbilities.creatureId), asc(schema.creatureAbilities.sortOrder))
      .limit(params.limit)
      .offset(params.offset);
  },

  async upsert(body: UpsertCreatureAbilityBody) {
    return db.transaction(async (tx) => {
      const resolved = await resolveLink(tx, body);
      const inserted = await tx
        .insert(schema.creatureAbilities)
        .values(resolved)
        .onConflictDoUpdate({
          target: [schema.creatureAbilities.creatureId, schema.creatureAbilities.abilityId],
          set: {
            learnLevel: resolved.learnLevel,
            sortOrder: resolved.sortOrder,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.creatureAbilities.id });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Creature ${body.creatureCode} learns ${body.abilityCode} at level ${resolved.learnLevel}`,
        reason: body.reason,
        impact: body.impact,
        entity: "creature_abilities",
        entityId: row.id,
      });
      return { id: row.id, version };
    });
  },

  async batchUpsert(body: BatchUpsertCreatureAbilitiesBody) {
    const { reason, impact, items } = body;
    return db.transaction(async (tx) => {
      const ids: number[] = [];
      // Sequential so a bad code surfaces with its own row rather than as a
      // race between parallel statements sharing one transaction.
      for (const item of items) {
        const resolved = await resolveLink(tx, item);
        const inserted = await tx
          .insert(schema.creatureAbilities)
          .values(resolved)
          .onConflictDoUpdate({
            target: [schema.creatureAbilities.creatureId, schema.creatureAbilities.abilityId],
            set: {
              learnLevel: resolved.learnLevel,
              sortOrder: resolved.sortOrder,
              updatedAt: new Date(),
            },
          })
          .returning({ id: schema.creatureAbilities.id });
        ids.push(inserted[0]!.id);
      }
      const version = await recordChange(tx, {
        change: `${ids.length} creature-ability links upserted in batch`,
        reason,
        impact,
        entity: "creature_abilities",
      });
      return { ids, version };
    });
  },
};
