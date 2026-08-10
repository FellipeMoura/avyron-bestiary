import { integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { awakeningTypeEnum } from "./enums";
import { biomes, gameMaps } from "./gameMaps";
import { creatureClasses } from "./creatureClasses";
import { elements } from "./elements";
import { timestamps } from "./timestamps";

export const creatures = pgTable("creatures", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  originalName: text("original_name").notNull(),
  baseSpecies: text("base_species"),
  classId: integer("class_id")
    .notNull()
    .references(() => creatureClasses.id),
  elementId: integer("element_id")
    .notNull()
    .references(() => elements.id),
  mapId: integer("map_id").references(() => gameMaps.id),
  biomeId: integer("biome_id").references(() => biomes.id),
  role: text("role"),
  silhouetteNote: text("silhouette_note"),
  status: text("status"),
  modelUrl: text("model_url"),
  ...timestamps,
});

/**
 * 1-to-1 with creatures — enforced by UNIQUE on creature_id. Absence of a
 * row means the creature has no awakening yet. The `creatures` table does
 * NOT carry an awakening_id (would create redundant state).
 *
 * `activation_chance_pct` captures the `(30%)` seen in xlsx values like
 * "Troca (30%)" and lines up with the "70/30" rule from the roadmap.
 */
export const awakenings = pgTable("awakenings", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  creatureId: integer("creature_id")
    .notNull()
    .unique()
    .references(() => creatures.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: awakeningTypeEnum("type").notNull(),
  activationChancePct: integer("activation_chance_pct"),
  referenceSpecies: text("reference_species"),
  visualChanges: text("visual_changes"),
  notes: text("notes"),
  ...timestamps,
});

export type Creature = typeof creatures.$inferSelect;
export type NewCreature = typeof creatures.$inferInsert;
export type Awakening = typeof awakenings.$inferSelect;
export type NewAwakening = typeof awakenings.$inferInsert;
