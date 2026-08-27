import { integer, pgTable, real, serial, text, unique } from "drizzle-orm/pg-core";
import { timestamps } from "./timestamps";

/**
 * The palette columns are the element's visual identity, consumed by the game
 * to recolour the shared placeholder bodies (Godot: `ElementPalette`). They
 * live here — not in GDScript — for the same reason every tuning number does:
 * the game repo is code, this one is content, and "what colour is Fire" is a
 * decision a designer changes without touching a shader.
 *
 * The three stops are a ramp read by LUMINANCE, not a set of independent
 * colours: `paletteShadow` is where the darkest texels of the source atlas
 * land, `paletteHighlight` where the brightest do, `paletteMid` the middle.
 * That is what lets "yellow with black" exist as one element — Electricity is
 * a near-black shadow with a yellow highlight, and the ramp does the rest.
 *
 * Nullable on purpose: an element without a palette falls back to the neutral
 * body in game rather than blocking the export. Only `paletteSpread` is
 * NOT NULL because zero is a meaningful, safe default (no variation).
 */
export const elements = pgTable("elements", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  notes: text("notes"),
  paletteShadow: text("palette_shadow"),
  paletteMid: text("palette_mid"),
  paletteHighlight: text("palette_highlight"),
  /**
   * Colour of the Despertar Ancestral aura. Nullable, and when null the game
   * falls back to `paletteHighlight` — but it exists as its own column
   * because the obvious choice is the wrong one: an aura in the body's own
   * colour is invisible on the creature that most needs it to read. Author it
   * brighter than the highlight, or accept the fallback knowing the risk.
   */
  paletteAura: text("palette_aura"),
  /**
   * How far individual creatures of this element may drift inside the family,
   * 0..1. The game derives a per-creature bias in [-spread, +spread] from the
   * creature code and biases the ramp lookup with it, so two Fire creatures
   * sharing a placeholder body do not come out identical. It biases the ramp
   * POSITION, never the hue, so drift can never leave the element.
   */
  paletteSpread: real("palette_spread").notNull().default(0),
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
