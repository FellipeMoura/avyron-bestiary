import { check, integer, jsonb, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { biomeRegionShapeEnum, eraEnum } from "./enums";
import { glyphs } from "./glyphs";
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
   * DEPRECATED — do not write. Emptied in 2026-08; drop pending.
   *
   * Held the original text like "Costa > Mar raso > Pantanos > Floresta >
   * Regiao vulcanica", and the condition for keeping it was that the
   * referenced biomes were not yet cataloged. They are: `map_biomes` carries
   * the same progression, ordered by `sortOrder`, and it is that junction —
   * not this string — that the bundle exports and the game reads.
   *
   * The two copies had already drifted (this said "Plataforma Rasa (Mar
   * Raso)", the biomes table says "Mar raso"), which is the whole reason a
   * second copy is not worth keeping. Progression of a map is authored in
   * `map_biomes`.
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

/**
 * How the player crosses from one map to the next — one row per directed
 * crossing (design document `glifos-e-portais`).
 *
 * A junction and not a pair of columns on `game_maps` because "the
 * progression is linear" is a property of the DATA, not of the schema: with
 * an edge list, an optional route or a shortcut later is a row, not a
 * migration. The same reasoning as `map_biomes` replacing
 * `biome_progression_raw`.
 *
 * **`required_glyph_id` is nullable, and the null is the whole design.**
 * Every map has an arena, but only the arena of the LAST map of an era
 * grants the Glifo that opens the next era. So crossings inside an era carry
 * no glyph (free passage, no guardian) and crossings between eras carry one.
 * One table expresses both; a boolean `is_gated` plus a code would have
 * expressed the same thing twice and let them disagree.
 *
 * Where the guardian physically STANDS is not here — that is scene layout,
 * and it lives in the Godot repo with the other fixed spots. This table says
 * who connects to whom and what it costs.
 */
export const mapConnections = pgTable(
  "map_connections",
  {
    id: serial("id").primaryKey(),
    fromMapId: integer("from_map_id")
      .notNull()
      .references(() => gameMaps.id, { onDelete: "cascade" }),
    toMapId: integer("to_map_id")
      .notNull()
      .references(() => gameMaps.id, { onDelete: "cascade" }),
    /** Null = free passage. Non-null = a guardian demands this Glifo. */
    requiredGlyphId: integer("required_glyph_id").references(() => glyphs.id),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    uniquePair: unique("map_connections_from_to_unique").on(t.fromMapId, t.toMapId),
    noSelfLoop: check("map_connections_no_self_loop", sql`${t.fromMapId} <> ${t.toMapId}`),
  }),
);

/**
 * Where inside a map each biome actually is — the spatial partition that
 * `WorldRoot.DEFAULT_BIOME` stands in for today.
 *
 * An entity with its own `code`, not a junction: `map_biomes` is keyed by the
 * pair (a biome belongs to a map, once), but a biome can occupy SEVERAL
 * disjoint regions of the same map, so the pair does not identify a row.
 * Having a code is also what gives regions a delete path — junctions here are
 * upsert-only by convention, and a region genuinely needs to be removable.
 *
 * **Coordinates are normalized to [-1, 1] on both axes, never meters.** The
 * map is the unit square and Godot multiplies by its own half-extent
 * (`MapTerrain.SIZE * 0.5`). In meters, changing the map size would silently
 * invalidate every region — they would still resolve, just to the wrong
 * ground. Normalized, they follow. The `y` axis does not appear at all:
 * biome is a question about the plane, and height is the terrain's business.
 *
 * `params` is validated by shape in the API (discriminated union on
 * `shape`), because a CHECK cannot express "these keys iff that enum value":
 * - `band`   `{ axis: "x" | "z", from, to }` — a strip, the `on_coast` shape
 * - `circle` `{ cx, cz, r }` — the `on_island` shape
 * - `rect`   `{ x0, z0, x1, z1 }`
 *
 * **Resolution is declared, not implied:** regions are evaluated in
 * `sort_order` and the first match wins; a point matching none falls back to
 * the map's first biome by `map_biomes.sortOrder`. Without a declared
 * fallback a gap in coverage would answer "no biome", and the mining formula
 * treats an absent side as neutral — the failure would be silent, which is
 * the exact trap `MapTerrain.submerged` already avoids by declaring that
 * outside the two dry patches the answer is always "submerged".
 */
export const mapBiomeRegions = pgTable(
  "map_biome_regions",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    mapId: integer("map_id")
      .notNull()
      .references(() => gameMaps.id, { onDelete: "cascade" }),
    biomeId: integer("biome_id")
      .notNull()
      .references(() => biomes.id, { onDelete: "cascade" }),
    shape: biomeRegionShapeEnum("shape").notNull(),
    params: jsonb("params").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    uniquePlace: unique("map_biome_regions_map_biome_order_unique").on(
      t.mapId,
      t.biomeId,
      t.sortOrder,
    ),
  }),
);

export type GameMap = typeof gameMaps.$inferSelect;
export type NewGameMap = typeof gameMaps.$inferInsert;
export type Biome = typeof biomes.$inferSelect;
export type NewBiome = typeof biomes.$inferInsert;
export type MapBiome = typeof mapBiomes.$inferSelect;
export type MapConnection = typeof mapConnections.$inferSelect;
export type NewMapConnection = typeof mapConnections.$inferInsert;
export type MapBiomeRegion = typeof mapBiomeRegions.$inferSelect;
export type NewMapBiomeRegion = typeof mapBiomeRegions.$inferInsert;
