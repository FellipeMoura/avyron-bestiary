import { integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { eraEnum } from "./enums";
import { timestamps } from "./timestamps";

/**
 * Table is `game_maps` (not `maps`) so the TS type is `GameMap` — avoids
 * collision with the built-in `Map`.
 */
export const gameMaps = pgTable("game_maps", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  era: eraEnum("era").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * Original text like "Costa > Mar raso > Pantanos > Floresta > Regiao vulcanica".
   * Kept while the referenced biomes are not fully cataloged in the biomes table.
   */
  biomeProgressionRaw: text("biome_progression_raw"),
  status: text("status"),
  notes: text("notes"),
  ...timestamps,
});

export const biomes = pgTable("biomes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  /** CSV of element names (e.g. "Água,Terra"). Promote to a table if it grows. */
  predominantElements: text("predominant_elements"),
  notes: text("notes"),
  ...timestamps,
});

/** Join table replacing biomes.mapas[] and game_maps.biome_progression. */
export const mapBiomes = pgTable(
  "map_biomes",
  {
    id: serial("id").primaryKey(),
    mapId: integer("map_id")
      .notNull()
      .references(() => gameMaps.id, { onDelete: "cascade" }),
    biomeId: integer("biome_id")
      .notNull()
      .references(() => biomes.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    uniquePair: unique().on(t.mapId, t.biomeId),
  }),
);

export type GameMap = typeof gameMaps.$inferSelect;
export type NewGameMap = typeof gameMaps.$inferInsert;
export type Biome = typeof biomes.$inferSelect;
export type NewBiome = typeof biomes.$inferInsert;
export type MapBiome = typeof mapBiomes.$inferSelect;
