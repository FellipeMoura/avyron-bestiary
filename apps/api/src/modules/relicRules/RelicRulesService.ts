import { eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { RELIC_RULE_PAYLOAD } from "./RelicRulesTypes";
import type { UpdateRelicRulesBody } from "./RelicRulesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const SINGLETON_ID = 1;

/** Same self-healing insert as `combatRulesService.ensureRow` — see there for why. */
async function ensureRow(tx: Tx): Promise<void> {
  const existing = await tx
    .select({ id: schema.relicRules.id })
    .from(schema.relicRules)
    .where(eq(schema.relicRules.id, SINGLETON_ID))
    .limit(1);
  if (existing.length === 0) {
    await tx.insert(schema.relicRules).values({ id: SINGLETON_ID }).onConflictDoNothing();
  }
}

export const relicRulesService = {
  async get() {
    const rows = await db.transaction(async (tx) => {
      await ensureRow(tx);
      return tx
        .select()
        .from(schema.relicRules)
        .where(eq(schema.relicRules.id, SINGLETON_ID))
        .limit(1);
    });
    const row = rows[0];
    if (!row) throw new AppError("relic rules not found", 404);
    return row;
  },

  async update(body: UpdateRelicRulesBody): Promise<{ version: string }> {
    const { reason, impact } = body;

    const patch: Record<string, unknown> = {};
    for (const key of RELIC_RULE_PAYLOAD) {
      const value = (body as Record<string, unknown>)[key];
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length === 0) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }

    return db.transaction(async (tx) => {
      await ensureRow(tx);

      const current = (
        await tx
          .select()
          .from(schema.relicRules)
          .where(eq(schema.relicRules.id, SINGLETON_ID))
          .limit(1)
      )[0]!;

      const merged = { ...current, ...patch } as typeof current;
      if (merged.captureFloorPct > merged.captureCeilPct) {
        throw new AppError(
          `captureFloorPct (${merged.captureFloorPct}) cannot exceed captureCeilPct (${merged.captureCeilPct})`,
          422,
        );
      }

      await tx
        .update(schema.relicRules)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.relicRules.id, SINGLETON_ID));

      const version = await recordChange(tx, {
        change: `Relic rules updated (${Object.keys(patch).join(", ")})`,
        reason,
        impact,
        entity: "relic_rules",
        entityId: SINGLETON_ID,
      });
      return { version };
    });
  },
};
