import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
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
 * Até 2026-09 existia aqui a tabela `awakenings` (1:1 com a criatura: nome,
 * tipo reforço/troca, espécie de referência). O Despertar Ancestral deixou de
 * ser "uma criatura que vira outra" e passou a ser um buff universal de
 * combate — os dois números que restaram vivem em `combat_rules`
 * (`awakeningMultiplier`, `awakeningDurationTurns`).
 */
export type Creature = typeof creatures.$inferSelect;
export type NewCreature = typeof creatures.$inferInsert;
