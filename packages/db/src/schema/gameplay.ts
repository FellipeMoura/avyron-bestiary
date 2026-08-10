import { boolean, check, integer, pgTable, real, serial, text, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { itemCategoryEnum, npcRoleEnum } from "./enums";
import { creatures } from "./creatures";
import { creatureClasses } from "./creatureClasses";
import { elements } from "./elements";
import { biomes, gameMaps } from "./gameMaps";
import { timestamps } from "./timestamps";

export const abilities = pgTable("abilities", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  elementId: integer("element_id").references(() => elements.id),
  type: text("type"),
  effect: text("effect"),
  awakeningOnly: boolean("awakening_only").notNull().default(false),
  notes: text("notes"),
  ...timestamps,
});

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  /** Enum, not free text — the export filters minable ore on this column. */
  category: itemCategoryEnum("category").notNull().default("mineral"),
  effect: text("effect"),
  acquisition: text("acquisition"),
  notes: text("notes"),
  ...timestamps,
});

export const npcs = pgTable("npcs", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  faction: text("faction"),
  mapId: integer("map_id").references(() => gameMaps.id),
  /** Decides which screen the game opens on interaction. */
  role: npcRoleEnum("role").notNull().default("flavor"),
  notes: text("notes"),
  ...timestamps,
});

/**
 * What a merchant carries. Junction npc × item with upsert semantics, same
 * shape as `drops` and `map_biomes`.
 *
 * `price` is an override; null means "charge `item_stats.value`". Having the
 * override lets one merchant be expensive without duplicating the item, which
 * is what makes a second village cost data instead of code.
 */
export const merchantOffers = pgTable(
  "merchant_offers",
  {
    id: serial("id").primaryKey(),
    npcId: integer("npc_id")
      .notNull()
      .references(() => npcs.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    price: integer("price"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    uniquePair: unique("merchant_offers_npc_item_unique").on(t.npcId, t.itemId),
    priceRange: check("merchant_offers_price_range", sql`${t.price} IS NULL OR ${t.price} >= 0`),
  }),
);

export type MerchantOffer = typeof merchantOffers.$inferSelect;
export type NewMerchantOffer = typeof merchantOffers.$inferInsert;

export const missions = pgTable("missions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type"),
  mapId: integer("map_id").references(() => gameMaps.id),
  npcId: integer("npc_id").references(() => npcs.id),
  requirement: text("requirement"),
  reward: text("reward"),
  status: text("status"),
  ...timestamps,
});

export const drops = pgTable(
  "drops",
  {
    id: serial("id").primaryKey(),
    creatureId: integer("creature_id")
      .notNull()
      .references(() => creatures.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    chance: real("chance").notNull(),
    condition: text("condition"),
    ...timestamps,
  },
  (t) => ({
    uniqueTuple: unique().on(t.creatureId, t.itemId, t.condition),
    chanceRange: check("drops_chance_range", sql`${t.chance} >= 0 AND ${t.chance} <= 1`),
  }),
);

export type Ability = typeof abilities.$inferSelect;
export type NewAbility = typeof abilities.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Npc = typeof npcs.$inferSelect;
export type NewNpc = typeof npcs.$inferInsert;
export type Mission = typeof missions.$inferSelect;
export type NewMission = typeof missions.$inferInsert;
export type Drop = typeof drops.$inferSelect;
export type NewDrop = typeof drops.$inferInsert;

/**
 * Mining rates junction: one record per (class × item) or (biome × item).
 * Exactly one of classId/biomeId is non-null (enforced by CHECK).
 * weight is a relative value [0,1] — the game normalizes per subject.
 * Final ore chance = normalize(class_weight[ore] × biome_weight[ore]).
 */
export const miningRates = pgTable(
  "mining_rates",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id").references(() => creatureClasses.id, { onDelete: "cascade" }),
    biomeId: integer("biome_id").references(() => biomes.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    weight: real("weight").notNull(),
    ...timestamps,
  },
  (t) => ({
    uniqueClassItem: unique("mining_rates_class_item_unique").on(t.classId, t.itemId),
    uniqueBiomeItem: unique("mining_rates_biome_item_unique").on(t.biomeId, t.itemId),
    subjectCheck: check(
      "mining_rates_subject_check",
      sql`(${t.classId} IS NULL) != (${t.biomeId} IS NULL)`,
    ),
    weightRange: check("mining_rates_weight_range", sql`${t.weight} >= 0 AND ${t.weight} <= 1`),
  }),
);

export type MiningRate = typeof miningRates.$inferSelect;
export type NewMiningRate = typeof miningRates.$inferInsert;
