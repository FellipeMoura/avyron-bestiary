import { eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { PROGRESSION_RULE_PAYLOAD } from "./ProgressionRulesTypes";
import type { UpdateProgressionRulesBody } from "./ProgressionRulesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const SINGLETON_ID = 1;

/**
 * Cria a linha única se ela ainda não existe, com os defaults do schema —
 * mesmo motivo de `combat_rules`: um banco recém-criado ou um restore
 * parcial ficariam sem a linha, e o sintoma seria o jogo sem curva de XP.
 */
async function ensureRow(tx: Tx): Promise<void> {
  const existing = await tx
    .select({ id: schema.progressionRules.id })
    .from(schema.progressionRules)
    .where(eq(schema.progressionRules.id, SINGLETON_ID))
    .limit(1);
  if (existing.length === 0) {
    await tx.insert(schema.progressionRules).values({ id: SINGLETON_ID }).onConflictDoNothing();
  }
}

export const progressionRulesService = {
  async get() {
    const rows = await db.transaction(async (tx) => {
      await ensureRow(tx);
      return tx
        .select()
        .from(schema.progressionRules)
        .where(eq(schema.progressionRules.id, SINGLETON_ID))
        .limit(1);
    });
    const row = rows[0];
    if (!row) throw new AppError("progression rules not found", 404);
    return row;
  },

  async update(body: UpdateProgressionRulesBody): Promise<{ version: string }> {
    const { reason, impact } = body;

    const patch: Record<string, unknown> = {};
    for (const key of PROGRESSION_RULE_PAYLOAD) {
      const value = (body as Record<string, unknown>)[key];
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length === 0) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }

    return db.transaction(async (tx) => {
      await ensureRow(tx);

      await tx
        .update(schema.progressionRules)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.progressionRules.id, SINGLETON_ID));

      const version = await recordChange(tx, {
        change: `Progression rules updated (${Object.keys(patch).join(", ")})`,
        reason,
        impact,
        entity: "progression_rules",
        entityId: SINGLETON_ID,
      });
      return { version };
    });
  },
};
