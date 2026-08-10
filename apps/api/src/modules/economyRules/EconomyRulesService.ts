import { eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { ECONOMY_RULE_PAYLOAD } from "./EconomyRulesTypes";
import type { UpdateEconomyRulesBody } from "./EconomyRulesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const SINGLETON_ID = 1;

/**
 * Cria a linha única se ela ainda não existe, com os defaults do schema.
 * Mesma razão do `combat_rules`: um banco de dev recém-criado ou um `db:pull`
 * que não trouxe a tabela ficariam sem a linha, e o sintoma seria o jogo sem
 * moeda. Assim o primeiro acesso conserta sozinho.
 */
async function ensureRow(tx: Tx): Promise<void> {
  const existing = await tx
    .select({ id: schema.economyRules.id })
    .from(schema.economyRules)
    .where(eq(schema.economyRules.id, SINGLETON_ID))
    .limit(1);
  if (existing.length === 0) {
    await tx.insert(schema.economyRules).values({ id: SINGLETON_ID }).onConflictDoNothing();
  }
}

export const economyRulesService = {
  async get() {
    const rows = await db.transaction(async (tx) => {
      await ensureRow(tx);
      return tx
        .select()
        .from(schema.economyRules)
        .where(eq(schema.economyRules.id, SINGLETON_ID))
        .limit(1);
    });
    const row = rows[0];
    if (!row) throw new AppError("economy rules not found", 404);
    return row;
  },

  async update(body: UpdateEconomyRulesBody): Promise<{ version: string }> {
    const { reason, impact } = body;

    const patch: Record<string, unknown> = {};
    for (const key of ECONOMY_RULE_PAYLOAD) {
      const value = (body as Record<string, unknown>)[key];
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length === 0) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }

    return db.transaction(async (tx) => {
      await ensureRow(tx);

      await tx
        .update(schema.economyRules)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.economyRules.id, SINGLETON_ID));

      const version = await recordChange(tx, {
        change: `Economy rules updated (${Object.keys(patch).join(", ")})`,
        reason,
        impact,
        entity: "economy_rules",
        entityId: SINGLETON_ID,
      });
      return { version };
    });
  },
};
