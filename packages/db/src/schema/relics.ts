import { check, integer, pgTable, real, serial, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { creatureClasses } from "./creatureClasses";
import { elements } from "./elements";
import { timestamps } from "./timestamps";

/**
 * Relicário — the equipment that replaces the old consumable capture items
 * (Resina Comum/Densa/Ancestral, `ITM-013..015`). No consumable is spent on
 * a capture attempt anymore; what limits the player is slot capacity and
 * general storage. See design document `relicario`.
 *
 * A model's `elementId`/`classId` are fixed for its whole lifetime — they do
 * not change as the relic levels up. Only `relic_stats` (the numbers layer)
 * scales with level.
 *
 * Both are nullable: the starter relic the player boots with is neutral —
 * no elemental or class affinity, `null = null` on both — same "no
 * affinity" pattern `abilities.elementId` already uses. A specialized relic
 * still has both set; the game reads absence as "no bonus/penalty from this
 * axis" (`RelicMath.capture_chance`), not as a data gap.
 */
export const relics = pgTable("relics", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  elementId: integer("element_id").references(() => elements.id),
  classId: integer("class_id").references(() => creatureClasses.id),
  notes: text("notes"),
  ...timestamps,
});

export type Relic = typeof relics.$inferSelect;
export type NewRelic = typeof relics.$inferInsert;

/**
 * The numbers layer for a relic model, 1:1 by relic code — same split the
 * catalog already keeps between `items` (descriptive) and `item_stats`
 * (executable).
 *
 * `slotCapacity`, `maxLevel` and the capture-rate curve are fixed
 * per-model; only the relic *instance*'s current level (player save state,
 * not catalog data) picks a point on these curves. The catalog only needs to
 * describe the curve, not track any player's progress on it.
 */
export const relicStats = pgTable(
  "relic_stats",
  {
    id: serial("id").primaryKey(),
    relicId: integer("relic_id")
      .notNull()
      .unique()
      .references(() => relics.id, { onDelete: "cascade" }),

    /** Creatures the player can carry on the map at once while this model is equipped. */
    slotCapacity: integer("slot_capacity").notNull(),

    /** Capture rate at relic level 1. Numerator of `base%` in the capture formula. */
    baseCaptureRate: integer("base_capture_rate").notNull(),
    /** Added to the capture rate per relic level above 1. */
    captureRatePerLevel: real("capture_rate_per_level").notNull(),
    maxLevel: integer("max_level").notNull().default(30),

    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    slotRange: check("relic_stats_slot_range", sql`${t.slotCapacity} >= 1 AND ${t.slotCapacity} <= 12`),
    baseCaptureRange: check(
      "relic_stats_base_capture_range",
      sql`${t.baseCaptureRate} >= 1 AND ${t.baseCaptureRate} <= 500`,
    ),
    perLevelRange: check(
      "relic_stats_per_level_range",
      sql`${t.captureRatePerLevel} >= 0 AND ${t.captureRatePerLevel} <= 100`,
    ),
    maxLevelRange: check("relic_stats_max_level_range", sql`${t.maxLevel} >= 1 AND ${t.maxLevel} <= 999`),
  }),
);

export type RelicStat = typeof relicStats.$inferSelect;
export type NewRelicStat = typeof relicStats.$inferInsert;

/**
 * Global tuning constants for the Relicário capture/progression system.
 * Singleton, same contract as `combat_rules`/`economy_rules`/`progression_rules`
 * — `GET`/`PATCH` only, no code, no list, no POST.
 *
 * Deliberately its own table rather than new columns on `combat_rules`:
 * `captureMinChance`/`captureMaxChance` there are 0–1 fractions feeding the
 * old HP-based formula (`captura` document, superseded). The Relicário
 * formula works in 0–100 percentage points end to end
 * (`base% ± bonuses, clamped`), and mixing the two scales in one table would
 * make misreads easy. `combat_rules` is left untouched.
 */
export const relicRules = pgTable(
  "relic_rules",
  {
    id: integer("id").primaryKey().default(1),

    /** Floor and ceiling of `final%` in the capture formula — never guaranteed, never impossible. */
    captureFloorPct: real("capture_floor_pct").notNull().default(5),
    captureCeilPct: real("capture_ceil_pct").notNull().default(95),

    /** Added to `base%` when the relic's element matches the creature's. */
    sameElementBonusPct: real("same_element_bonus_pct").notNull().default(15),
    /** Added to `base%` when the relic's class matches the creature's. */
    sameClassBonusPct: real("same_class_bonus_pct").notNull().default(10),
    /**
     * Subtracted from `base%` when the relic's element is at a disadvantage
     * against the creature's (per `elemental_advantages`, multiplier 0.5).
     * Stored positive; the formula subtracts it.
     */
    elementDisadvantagePenaltyPct: real("element_disadvantage_penalty_pct").notNull().default(15),

    /**
     * Relic level-up gate — same two-part shape as `progression_rules`
     * (XP threshold + class material spent), but the "target" is a
     * successful capture instead of a defeated creature.
     *
     * `xpPerCapture` is flat per success (captures don't have a per-target
     * yield the way defeated creatures do). `xpCurveBase`/`xpCurveExponent`
     * feed the same `xpToNext(level) = floor(base * level^exponent)` shape
     * used for creature levelling. All four are explicit placeholders —
     * nothing here has been playtested.
     */
    xpPerCapture: integer("xp_per_capture").notNull().default(20),
    xpCurveBase: real("xp_curve_base").notNull().default(10),
    xpCurveExponent: real("xp_curve_exponent").notNull().default(1.5),

    /** Units of the relic's class material spent on level-up, same shape as `progression_rules.itemCostBase`. */
    materialCostBase: integer("material_cost_base").notNull().default(1),
    /** Every this many levels, material cost grows by one unit. */
    materialCostLevelStep: integer("material_cost_level_step").notNull().default(20),

    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    singleton: check("relic_rules_singleton", sql`${t.id} = 1`),
    captureChanceOrder: check(
      "relic_rules_capture_chance_order",
      sql`${t.captureFloorPct} >= 0 AND ${t.captureFloorPct} <= ${t.captureCeilPct}
          AND ${t.captureCeilPct} <= 100`,
    ),
    bonusRange: check(
      "relic_rules_bonus_range",
      sql`${t.sameElementBonusPct} >= 0 AND ${t.sameElementBonusPct} <= 100
          AND ${t.sameClassBonusPct} >= 0 AND ${t.sameClassBonusPct} <= 100
          AND ${t.elementDisadvantagePenaltyPct} >= 0 AND ${t.elementDisadvantagePenaltyPct} <= 100`,
    ),
    xpPerCaptureRange: check(
      "relic_rules_xp_per_capture_range",
      sql`${t.xpPerCapture} > 0 AND ${t.xpPerCapture} <= 1000`,
    ),
    xpCurveBaseRange: check(
      "relic_rules_xp_curve_base_range",
      sql`${t.xpCurveBase} > 0::real AND ${t.xpCurveBase} <= 1000::real`,
    ),
    xpCurveExponentRange: check(
      "relic_rules_xp_curve_exponent_range",
      sql`${t.xpCurveExponent} >= 1::real AND ${t.xpCurveExponent} <= 4::real`,
    ),
    materialCostBaseRange: check(
      "relic_rules_material_cost_base_range",
      sql`${t.materialCostBase} >= 0 AND ${t.materialCostBase} <= 100`,
    ),
    materialCostLevelStepRange: check(
      "relic_rules_material_cost_level_step_range",
      sql`${t.materialCostLevelStep} > 0 AND ${t.materialCostLevelStep} <= 999`,
    ),
  }),
);

export type RelicRule = typeof relicRules.$inferSelect;
export type NewRelicRule = typeof relicRules.$inferInsert;
