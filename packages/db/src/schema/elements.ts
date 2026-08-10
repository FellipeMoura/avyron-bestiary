import { integer, pgTable, real, serial, text, unique } from "drizzle-orm/pg-core";
import { timestamps } from "./timestamps";

export const elements = pgTable("elements", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  notes: text("notes"),
  ...timestamps,
});

/**
 * Replaces the string arrays `Forte_Contra` / `Fraco_Contra` from the xlsx.
 * One row per (attacker, defender). multiplier > 1 = strong; < 1 = weak.
 * Symmetry is not enforced — an entry for (A vs B) does not imply (B vs A).
 */
export const elementalAdvantages = pgTable(
  "elemental_advantages",
  {
    id: serial("id").primaryKey(),
    attackerElementId: integer("attacker_element_id")
      .notNull()
      .references(() => elements.id, { onDelete: "cascade" }),
    defenderElementId: integer("defender_element_id")
      .notNull()
      .references(() => elements.id, { onDelete: "cascade" }),
    multiplier: real("multiplier").notNull(),
    ...timestamps,
  },
  (t) => ({
    uniquePair: unique().on(t.attackerElementId, t.defenderElementId),
  }),
);

export type Element = typeof elements.$inferSelect;
export type NewElement = typeof elements.$inferInsert;
export type ElementalAdvantage = typeof elementalAdvantages.$inferSelect;
