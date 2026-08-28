import { boolean, check, integer, pgTable, real, serial, text, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { characterGenderEnum, itemCategoryEnum, npcRoleEnum } from "./enums";
import { creatures } from "./creatures";
import { creatureClasses } from "./creatureClasses";
import { elements } from "./elements";
import { biomes, gameMaps } from "./gameMaps";
import { glyphs } from "./glyphs";
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

export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    /** Enum, not free text — the export filters minable ore on this column. */
    category: itemCategoryEnum("category").notNull().default("mineral"),
    /**
     * Which class this material belongs to — set iff `category = 'material'`.
     *
     * Before this column, "Draconis levels up on Escama Fóssil" only existed
     * implicitly, repeated across 5 `drops` rows (one per Draconis creature).
     * Nothing enforced that a new Draconis' drop actually pointed at ITM-021,
     * and nothing let the game ask "what does my active creature's class
     * need" without scanning every creature's drops. This is that answer,
     * direct — same shape as `mining_rates.classId`.
     */
    classId: integer("class_id").references(() => creatureClasses.id),
    effect: text("effect"),
    acquisition: text("acquisition"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    materialClassCheck: check(
      "items_material_class_check",
      sql`(${t.category} = 'material' AND ${t.classId} IS NOT NULL)
          OR (${t.category} != 'material' AND ${t.classId} IS NULL)`,
    ),
  }),
);

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
 * Appearance recipe of an NPC — 1:1 child of `npcs`, same shape as
 * `creature_stats` is to `creatures`. Player and NPCs share one visual
 * system: a 65-bone skeleton and interchangeable parts (character kit,
 * `apps/web/public/models/characters/`); an NPC is a recipe authored here,
 * the player is a recipe chosen in-game (save data, never this table).
 *
 * Part columns hold part NAMES from the kit's manifest.json
 * (`Male_Ranger_Body`, `Hair_Long`…), not URLs — the game resolves names
 * through the mirrored manifest. The DB cannot see the manifest, so validity
 * is enforced where it can be: `game:export` fails on a name the manifest
 * doesn't list, same policy as a broken `modelUrl`.
 *
 * Nullable slots are genuinely optional (bald, no hood, no pauldron).
 * The four clothing slots are NOT NULL: the base body under them is hidden
 * at assembly (pack rule — only the head remains), so an NPC without pants
 * would render with a hole where legs should be.
 */
export const npcAppearances = pgTable("npc_appearances", {
  id: serial("id").primaryKey(),
  npcId: integer("npc_id")
    .notNull()
    .unique()
    .references(() => npcs.id, { onDelete: "cascade" }),
  gender: characterGenderEnum("gender").notNull(),
  hair: text("hair"),
  eyebrows: text("eyebrows"),
  beard: text("beard"),
  outfitBody: text("outfit_body").notNull(),
  outfitArms: text("outfit_arms").notNull(),
  outfitLegs: text("outfit_legs").notNull(),
  outfitFeet: text("outfit_feet").notNull(),
  outfitHead: text("outfit_head"),
  outfitAccessory: text("outfit_accessory"),
  notes: text("notes"),
  ...timestamps,
});

export type NpcAppearance = typeof npcAppearances.$inferSelect;
export type NewNpcAppearance = typeof npcAppearances.$inferInsert;

/**
 * What an arena duel actually is — 1:1 child of an NPC with `role = duelist`,
 * same shape `npc_appearances` has to the same parent.
 *
 * These three values lived as constants in the Godot repo
 * (`WorldPopulator.ARENA_OPPONENT_CODE/_LEVEL/_GRANTS_GLYPH`), and the level
 * among them is a balancing number, which rule 1 of that repo says never
 * belongs in code. The justification there was that a single arena is not
 * worth a table; with an arena per map that stops being true.
 *
 * **`grants_glyph_id` is nullable and UNIQUE, and both matter.** Nullable
 * because every map has an arena but only the last arena of an era grants the
 * Glifo — an intermediate arena is a real duel with its own reward, not a
 * gate. Unique because a Glifo is granted by exactly one arena; two arenas
 * pointing at the same one would let a player skip the intended crossing, and
 * nothing downstream would notice. Postgres treats NULLs as distinct, so the
 * many glyph-less arenas coexist under the same constraint.
 *
 * `opponent_level` is bounded here only against nonsense; the real ceiling is
 * `combat_rules.level_max`, which a CHECK cannot reach across tables — the
 * export is what enforces it.
 */
export const npcDuelists = pgTable(
  "npc_duelists",
  {
    id: serial("id").primaryKey(),
    npcId: integer("npc_id")
      .notNull()
      .unique()
      .references(() => npcs.id, { onDelete: "cascade" }),
    opponentCreatureId: integer("opponent_creature_id")
      .notNull()
      .references(() => creatures.id),
    opponentLevel: integer("opponent_level").notNull(),
    grantsGlyphId: integer("grants_glyph_id")
      .unique()
      .references(() => glyphs.id),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    levelRange: check("npc_duelists_level_range", sql`${t.opponentLevel} >= 1`),
  }),
);

export type NpcDuelist = typeof npcDuelists.$inferSelect;
export type NewNpcDuelist = typeof npcDuelists.$inferInsert;

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
    /**
     * `nullsNotDistinct`: sem isso o Postgres trata cada `condition` NULL como
     * valor distinto, dois POSTs do mesmo drop sem condicao nao conflitam e a
     * linha duplica em vez de atualizar — contra a regra de que junção se
     * reescreve por re-POST. Hoje as 26 linhas tem condicao preenchida, mas o
     * campo e opcional no schema Zod, entao a armadilha estava armada.
     */
    uniqueTuple: unique().on(t.creatureId, t.itemId, t.condition).nullsNotDistinct(),
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
