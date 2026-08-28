import { check, pgTable, real, serial, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { creatureStatEnum } from "./enums";
import { timestamps } from "./timestamps";

/**
 * Table is `creature_classes` (not `classes`) so the generated TS type is
 * `CreatureClass` — avoids collision with the JS `class` keyword.
 *
 * **A class is a gameplay specialisation, not a lineage.** Until 2026-08 the
 * three classes WERE the three lineages (arthropods / synapsids / sauropsids)
 * and `biological_scope` was the column that said so. That coupling capped
 * the cast: a creature whose biology fit nowhere could not enter the game,
 * which bit hardest on the oldest and the newest maps. Taxonomy stays
 * biologically honest, it just stopped being the class's job — the column is
 * gone rather than repurposed, because a column that used to mean lineage and
 * now means gameplay is the kind of field that reads correct and is wrong.
 *
 * Business rule, refined (was Changelog 0.01, "classes do NOT influence
 * combat"): a class grants a flat bonus to its OWN `primaryStat` and nothing
 * else. There is still **no CLS×CLS matchup** — no multiplier here ever
 * depends on the opponent's class, and no cycle like the elemental ring
 * exists between classes. That is the part of the old rule that never bends.
 */
export const creatureClasses = pgTable(
  "creature_classes",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull().unique(),
    /**
     * The one stat this class specialises in. Exactly one, never null — a
     * class with no specialisation is a class with no reason to exist, and
     * the game would silently apply a bonus to nothing.
     */
    primaryStat: creatureStatEnum("primary_stat").notNull(),
    /**
     * How much the class adds to its `primaryStat`, in percentage points
     * (`20` means +20%, same convention as `relic_rules.sameClassBonusPct`).
     *
     * It lives here and not in Godot because it is tuning: rule 1 of the game
     * repo says a number a designer might want to move never belongs in code.
     * The game reads it from the bundle and multiplies; `1.20` appears
     * nowhere in GDScript.
     */
    primaryStatBonusPct: real("primary_stat_bonus_pct").notNull().default(20),
    /** Player-facing gameplay blurb. Portuguese, like all domain content. */
    description: text("description").notNull(),
    passive: text("passive"),
    workFunction: text("work_function"),
    fusionRule: text("fusion_rule"),
    status: text("status"),
    ...timestamps,
  },
  (t) => ({
    bonusRange: check(
      "creature_classes_primary_stat_bonus_range",
      sql`${t.primaryStatBonusPct} >= 0`,
    ),
  }),
);

export type CreatureClass = typeof creatureClasses.$inferSelect;
export type NewCreatureClass = typeof creatureClasses.$inferInsert;
