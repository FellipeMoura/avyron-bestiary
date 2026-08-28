import { check, integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { equipmentEffectEnum, equipmentSlotEnum } from "./enums";
import { items } from "./gameplay";
import { timestamps } from "./timestamps";

/**
 * Equipment of the tamer that is NOT the Relicário — today the Amplificador
 * (buffs the player's own creature) and the Encantador (debuffs the
 * opponent's). See design document `equipamentos`.
 *
 * ## Why not columns on `relics`
 *
 * The Relicário's numbers layer is capture-shaped end to end: `slotCapacity`,
 * `baseCaptureRate`, `captureRatePerLevel`, `maxLevel`. None of them mean
 * anything for a passive combat modifier, and none of these models' columns
 * mean anything for capture. Merging the two would give every row a majority
 * of null columns and force every reader to know which half applies — the
 * shape that made `combatBuff` a promise on screen (see the same document).
 *
 * The two also progress differently and that is the deeper split: a relic
 * *levels* (XP + material, one model for the whole game), while these
 * *tier* (three crafted models, the mine is the progression). A shared table
 * would have to carry both curves.
 *
 * ## Why there is no `equipment_rules` singleton
 *
 * Because there is no global number for it to hold. The accumulated-modifier
 * clamp lives in `Battle.MODIFIER_MIN/MAX`, where it guards every source of a
 * modifier (abilities included), not just this one — moving it here would
 * give the clamp two owners. A table cadastrada sem consumidor is exactly
 * what migration `0014` had to undo.
 */
export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),

  /**
   * Which slot of the player's set this model occupies. Two models of the
   * same slot are alternatives (the tiers); models of different slots are
   * worn at the same time.
   */
  slot: equipmentSlotEnum("slot").notNull(),

  /** Prose for the web catalog. What the game runs is `equipment_stats`. */
  effect: text("effect"),
  notes: text("notes"),
  ...timestamps,
});

export type Equipment = typeof equipment.$inferSelect;
export type NewEquipment = typeof equipment.$inferInsert;

/**
 * The numbers layer for an equipment model, 1:1 by code — same split
 * `items`/`item_stats` and `relics`/`relic_stats` already keep.
 *
 * `effectCode` + `effectValue` is the same two-field contract the battle
 * system already honours for abilities: the code says how to read the
 * number, and reading the number without the code beside it is the misread
 * the pair exists to prevent.
 */
export const equipmentStats = pgTable(
  "equipment_stats",
  {
    id: serial("id").primaryKey(),
    equipmentId: integer("equipment_id")
      .notNull()
      .unique()
      .references(() => equipment.id, { onDelete: "cascade" }),

    /**
     * Rank inside the slot. Not a multiplier and not read by any formula —
     * it orders the bench and names the model. The strength is `effectValue`
     * alone, so a retune never has to keep two columns agreeing.
     */
    tier: integer("tier").notNull(),

    /** What the modifier does. Applied while equipped, for the whole battle. */
    effectCode: equipmentEffectEnum("effect_code").notNull(),

    /**
     * Percentage points, never a fraction — `10` is +10%, the same unit
     * `ability_stats.effectValue` uses for the same four effect codes. The
     * game applies it as `modifier *= 1 ± value/100`.
     */
    effectValue: integer("effect_value").notNull(),

    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    tierRange: check("equipment_stats_tier_range", sql`${t.tier} >= 1 AND ${t.tier} <= 9`),
    /**
     * Upper bound is 100 because these are percentage points of a stat, and
     * a passive that zeroes or doubles a stat by itself is a balance error,
     * not a tuning choice. The floor is 1: a model that does nothing is a
     * model that should not have been authored.
     */
    effectValueRange: check(
      "equipment_stats_effect_value_range",
      sql`${t.effectValue} >= 1 AND ${t.effectValue} <= 100`,
    ),
  }),
);

export type EquipmentStat = typeof equipmentStats.$inferSelect;
export type NewEquipmentStat = typeof equipmentStats.$inferInsert;

/**
 * What it costs to craft one model — a junction, natural key
 * (equipment, item), same upsert-no-PATCH contract as `drops`.
 *
 * A recipe input is always an `items` row and never another equipment: tiers
 * are independent crafts, not an upgrade chain that eats the previous tier.
 * That is a design choice with a cost — the player who jumps straight to T3
 * never spends the T1 material — and it buys the property that no model can
 * be made unreachable by having consumed another. If upgrade chains are ever
 * wanted, this table grows a nullable `inputEquipmentId`; it does not get a
 * polymorphic column.
 */
export const equipmentRecipes = pgTable(
  "equipment_recipes",
  {
    id: serial("id").primaryKey(),
    equipmentId: integer("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),

    /** Units of this item consumed by one craft. */
    quantity: integer("quantity").notNull(),

    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    naturalKey: unique("equipment_recipes_equipment_item").on(t.equipmentId, t.itemId),
    quantityRange: check(
      "equipment_recipes_quantity_range",
      sql`${t.quantity} >= 1 AND ${t.quantity} <= 999`,
    ),
  }),
);

export type EquipmentRecipe = typeof equipmentRecipes.$inferSelect;
export type NewEquipmentRecipe = typeof equipmentRecipes.$inferInsert;
