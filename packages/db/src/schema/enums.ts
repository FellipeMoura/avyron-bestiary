import { pgEnum } from "drizzle-orm/pg-core";

export const eraEnum = pgEnum("era", ["paleozoic", "mesozoic", "cenozoic"]);
export const awakeningTypeEnum = pgEnum("awakening_type", ["reinforcement", "swap"]);
export const documentStatusEnum = pgEnum("document_status", ["defined", "partial", "pending"]);

/**
 * Machine-readable effect of an ability. The battle system in Godot switches
 * on this — `abilities.effect` stays as prose for humans, this is what runs.
 * `damage` is the plain case: power + element multiplier, nothing else.
 */
export const abilityEffectEnum = pgEnum("ability_effect", [
  "damage",
  "buff_attack",
  "buff_defense",
  "debuff_attack",
  "debuff_defense",
  "heal",
  "charge_gain",
]);

/**
 * What an item *is*. Was free text, which the export could not filter on —
 * `mining.items` took every row in the table, so the first non-mineral item
 * added would have been exported as minable ore.
 *
 * `mineral` is what mining produces and the merchant buys: trade good, no
 * effect of its own. The rest are consumables the player buys.
 *
 * `material` is the third source: dropped by a wild creature on defeat, spent
 * on level-up. It is deliberately NOT `mineral` — the export filters minable
 * ore on this column, and a combat drop listed as ore would show up in
 * `mining.items` as something a tamed creature can dig up, which is exactly
 * the bug this enum exists to prevent.
 */
export const itemCategoryEnum = pgEnum("item_category", [
  "mineral",
  "capture",
  "heal",
  "material",
]);

/**
 * Machine-readable effect of an item — the same contract `ability_effect` has
 * with the battle system, for the inventory. `items.effect` stays prose for
 * humans; this is what Godot switches on.
 *
 * - `none` — pure trade good (every mineral).
 * - `capture_bonus` — `effectValue` multiplies the capture chance. The hook
 *   already existed in the game (`BattleAction.item_bonus`) and had no data
 *   feeding it.
 * - `heal_flat` — restores `effectValue` HP.
 * - `heal_percent` — restores `effectValue`% of max HP.
 */
export const itemEffectEnum = pgEnum("item_effect", [
  "none",
  "capture_bonus",
  "heal_flat",
  "heal_percent",
]);

/**
 * What an NPC does when the player clicks it. Drives which screen opens, so
 * it is not decorative — free text here would mean the game guessing.
 */
export const npcRoleEnum = pgEnum("npc_role", ["merchant", "duelist", "quest", "flavor"]);

/**
 * Body type of a human character (player or NPC). Not decorative: the modular
 * outfit parts in the character kit are gendered meshes (Male_Ranger_Legs ≠
 * Female_Ranger_Legs — different proportions, same skeleton), so this decides
 * which half of the parts catalog an appearance recipe may pick from.
 */
export const characterGenderEnum = pgEnum("character_gender", ["male", "female"]);

/**
 * Shape of one biome region inside a map (`map_biome_regions`).
 *
 * Three primitives, chosen because they are the ones the terrain already
 * expresses in code: `band` is `MapTerrain.on_coast` (a strip along one
 * axis), `circle` is `on_island`, and `rect` is the general case neither
 * covers. A fourth shape is a fourth branch of the discriminated union that
 * validates `params` — not a free-text field.
 */
export const biomeRegionShapeEnum = pgEnum("biome_region_shape", ["band", "circle", "rect"]);

/**
 * Which stat a creature class specialises in — the ONE stat its
 * `primaryStatBonusPct` multiplies.
 *
 * The five values are not a new vocabulary: they are exactly the five keys
 * `BestiaryData.stats_at_level` returns and the five `base*` columns of
 * `creature_stats`, minus the `base` prefix. Naming them anything else
 * (`attackSpeed`, `stamina`) would have created a second set of names for
 * stats the game already has, and every consumer would need a translation
 * table to cross the gap.
 *
 * The player-facing labels DO differ, and that is the normal split of this
 * repo (enum in English, label in Portuguese via `labels.ts`): `speed` reads
 * as "Velocidade de Ataque" because in a turn-based fight acting sooner is
 * what attack speed means, and `charge` reads as "Stamina" because the
 * Despertar meter is the only sustain resource a creature has.
 */
export const creatureStatEnum = pgEnum("creature_stat", [
  "hp",
  "attack",
  "defense",
  "speed",
  "charge",
]);

/**
 * Which slot of the player's set an equipment model occupies
 * (`equipment.slot`). The Relicário is deliberately NOT a value here: it has
 * its own table with its own columns, and adding it would imply the two are
 * interchangeable in queries they are not. See document `equipamentos`.
 *
 * Slots are worn simultaneously — one Amplificador AND one Encantador. What
 * competes inside a slot are the tiers.
 */
export const equipmentSlotEnum = pgEnum("equipment_slot", ["amplifier", "enchanter"]);

/**
 * Machine-readable effect of an equipment model — the third table to share
 * this contract with the battle system, after `ability_effect` and
 * `item_effect`.
 *
 * It is a separate enum rather than a reuse of `ability_effect` because only
 * four of that enum's seven values can be a permanent passive. `damage`,
 * `heal` and `charge_gain` are events — a thing that happens on a turn — and
 * an equipment row carrying one would be a value the game could not execute
 * and the DB had promised was valid. The overlap in the four names is
 * intentional: they mean exactly what they mean for an ability, and the game
 * applies them through the same `Combatant.attack_modifier` /
 * `defense_modifier` it already clamps.
 *
 * Who the modifier lands on is NOT in this enum — it comes from
 * `equipment.slot`: an `amplifier` applies to the player's creature, an
 * `enchanter` to the opponent's. Encoding the target here too would let the
 * two disagree.
 */
export const equipmentEffectEnum = pgEnum("equipment_effect", [
  "buff_attack",
  "buff_defense",
  "debuff_attack",
  "debuff_defense",
]);
