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
