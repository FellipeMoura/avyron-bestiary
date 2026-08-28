import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import { EQUIPMENT_RECIPE_FIELDS } from "./EquipmentRecipesTypes";
import type {
  BatchUpsertEquipmentRecipesBody,
  DeleteEquipmentRecipeBody,
  UpsertEquipmentRecipeBody,
} from "./EquipmentRecipesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface ResolvedRecipe {
  equipmentId: number;
  itemId: number;
  quantity: number;
  notes: string | null;
}

async function resolveRecipe(
  tx: Tx,
  item: { equipmentCode: string; itemCode: string; quantity: number; notes?: string | null },
): Promise<ResolvedRecipe> {
  const [equipmentId, itemId] = await Promise.all([
    resolveCodeInTx(tx, schema.equipment, item.equipmentCode, "equipmentCode"),
    resolveCodeInTx(tx, schema.items, item.itemCode, "itemCode"),
  ]);
  return { equipmentId, itemId, quantity: item.quantity, notes: item.notes ?? null };
}

export const equipmentRecipesService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    equipmentCode?: string;
    itemCode?: string;
  }) {
    const fields = parseFields(params.fields, EQUIPMENT_RECIPE_FIELDS);
    const projection = buildProjection(
      schema.equipmentRecipes as unknown as Record<string, unknown>,
      fields,
    );
    const [equipmentId, itemId] = await Promise.all([
      resolveOptionalCode(schema.equipment, params.equipmentCode, "equipmentCode"),
      resolveOptionalCode(schema.items, params.itemCode, "itemCode"),
    ]);
    const filters = [];
    if (equipmentId !== null) filters.push(eq(schema.equipmentRecipes.equipmentId, equipmentId));
    if (itemId !== null) filters.push(eq(schema.equipmentRecipes.itemId, itemId));
    const q = projection
      ? db.select(projection).from(schema.equipmentRecipes)
      : db.select().from(schema.equipmentRecipes);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.equipmentRecipes.id))
      .limit(params.limit)
      .offset(params.offset);
  },

  async upsert(body: UpsertEquipmentRecipeBody) {
    return db.transaction(async (tx) => {
      const resolved = await resolveRecipe(tx, body);
      const inserted = await tx
        .insert(schema.equipmentRecipes)
        .values(resolved)
        .onConflictDoUpdate({
          target: [schema.equipmentRecipes.equipmentId, schema.equipmentRecipes.itemId],
          set: { quantity: resolved.quantity, notes: resolved.notes, updatedAt: new Date() },
        })
        .returning({ id: schema.equipmentRecipes.id });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Recipe of ${body.equipmentCode} takes ${body.quantity}x ${body.itemCode}`,
        reason: body.reason,
        impact: body.impact,
        entity: "equipment_recipes",
        entityId: row.id,
      });
      return { id: row.id, version };
    });
  },

  async batchUpsert(body: BatchUpsertEquipmentRecipesBody) {
    const { reason, impact, items } = body;
    return db.transaction(async (tx) => {
      const rows = await Promise.all(items.map((item) => resolveRecipe(tx, item)));
      const inserted = await tx
        .insert(schema.equipmentRecipes)
        .values(rows)
        .onConflictDoUpdate({
          target: [schema.equipmentRecipes.equipmentId, schema.equipmentRecipes.itemId],
          // `excluded` is the proposed row — same trap `drops` documents: naming
          // the table column here would rewrite each old row with itself and the
          // changelog would claim an update that never happened.
          set: {
            quantity: sql`excluded.quantity`,
            notes: sql`excluded.notes`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.equipmentRecipes.id });
      const ids = inserted.map((r) => r.id);
      const version = await recordChange(tx, {
        change: `${inserted.length} equipment recipe lines upserted in batch`,
        reason,
        impact,
        entity: "equipment_recipes",
      });
      return { ids, version };
    });
  },

  async remove(body: DeleteEquipmentRecipeBody) {
    return db.transaction(async (tx) => {
      const [equipmentId, itemId] = await Promise.all([
        resolveCodeInTx(tx, schema.equipment, body.equipmentCode, "equipmentCode"),
        resolveCodeInTx(tx, schema.items, body.itemCode, "itemCode"),
      ]);
      const existing = await tx
        .select({ id: schema.equipmentRecipes.id })
        .from(schema.equipmentRecipes)
        .where(
          and(
            eq(schema.equipmentRecipes.equipmentId, equipmentId),
            eq(schema.equipmentRecipes.itemId, itemId),
          ),
        )
        .limit(1);
      const row = existing[0];
      if (!row) {
        throw new AppError(
          `Recipe of '${body.equipmentCode}' does not use item '${body.itemCode}'`,
          404,
        );
      }
      const version = await recordChange(tx, {
        change: `Recipe of ${body.equipmentCode} no longer uses ${body.itemCode}`,
        reason: body.reason,
        impact: body.impact,
        entity: "equipment_recipes",
        entityId: row.id,
      });
      await tx.delete(schema.equipmentRecipes).where(eq(schema.equipmentRecipes.id, row.id));
      return { id: row.id, version };
    });
  },
};
