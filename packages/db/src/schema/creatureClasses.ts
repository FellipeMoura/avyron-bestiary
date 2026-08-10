import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { timestamps } from "./timestamps";

/**
 * Table is `creature_classes` (not `classes`) so the generated TS type is
 * `CreatureClass` — avoids collision with the JS `class` keyword.
 *
 * Business rule (Changelog 0.01): classes do NOT influence combat. No
 * damage/multiplier fields should ever live here.
 */
export const creatureClasses = pgTable("creature_classes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  biologicalScope: text("biological_scope"),
  passive: text("passive"),
  workFunction: text("work_function"),
  fusionRule: text("fusion_rule"),
  status: text("status"),
  ...timestamps,
});

export type CreatureClass = typeof creatureClasses.$inferSelect;
export type NewCreatureClass = typeof creatureClasses.$inferInsert;
