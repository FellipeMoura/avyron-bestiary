import { eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { COMBAT_RULE_PAYLOAD } from "./CombatRulesTypes";
import type { UpdateCombatRulesBody } from "./CombatRulesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const SINGLETON_ID = 1;

/**
 * Cria a linha única se ela ainda não existe, com os defaults do schema.
 *
 * Preferido a semear pela migration: um banco de dev recém-criado, um
 * restore parcial ou um `db:pull` que não trouxe a tabela ficariam sem a
 * linha, e o sintoma seria o jogo sem constantes de combate. Assim o
 * primeiro acesso conserta sozinho.
 */
async function ensureRow(tx: Tx): Promise<void> {
  const existing = await tx
    .select({ id: schema.combatRules.id })
    .from(schema.combatRules)
    .where(eq(schema.combatRules.id, SINGLETON_ID))
    .limit(1);
  if (existing.length === 0) {
    await tx.insert(schema.combatRules).values({ id: SINGLETON_ID }).onConflictDoNothing();
  }
}

export const combatRulesService = {
  async get() {
    const rows = await db.transaction(async (tx) => {
      await ensureRow(tx);
      return tx
        .select()
        .from(schema.combatRules)
        .where(eq(schema.combatRules.id, SINGLETON_ID))
        .limit(1);
    });
    const row = rows[0];
    if (!row) throw new AppError("combat rules not found", 404);
    return row;
  },

  async update(body: UpdateCombatRulesBody): Promise<{ version: string }> {
    const { reason, impact } = body;

    const patch: Record<string, unknown> = {};
    for (const key of COMBAT_RULE_PAYLOAD) {
      const value = (body as Record<string, unknown>)[key];
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length === 0) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }

    return db.transaction(async (tx) => {
      await ensureRow(tx);

      // A variância e as chances de captura são pares ordenados, e o CHECK do
      // banco cobre o par inteiro. Validar contra o estado atual aqui deixa o
      // erro nomear o campo em vez de estourar como violação de constraint.
      const current = (
        await tx
          .select()
          .from(schema.combatRules)
          .where(eq(schema.combatRules.id, SINGLETON_ID))
          .limit(1)
      )[0]!;

      const merged = { ...current, ...patch } as typeof current;
      if (merged.damageVarianceMin > merged.damageVarianceMax) {
        throw new AppError(
          `damageVarianceMin (${merged.damageVarianceMin}) cannot exceed damageVarianceMax (${merged.damageVarianceMax})`,
          422,
        );
      }
      if (merged.captureMinChance > merged.captureMaxChance) {
        throw new AppError(
          `captureMinChance (${merged.captureMinChance}) cannot exceed captureMaxChance (${merged.captureMaxChance})`,
          422,
        );
      }
      if (merged.levelMin > merged.levelMax) {
        throw new AppError(
          `levelMin (${merged.levelMin}) cannot exceed levelMax (${merged.levelMax})`,
          422,
        );
      }

      await tx
        .update(schema.combatRules)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.combatRules.id, SINGLETON_ID));

      const version = await recordChange(tx, {
        change: `Combat rules updated (${Object.keys(patch).join(", ")})`,
        reason,
        impact,
        entity: "combat_rules",
        entityId: SINGLETON_ID,
      });
      return { version };
    });
  },
};
