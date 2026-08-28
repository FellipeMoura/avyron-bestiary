import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { timestamps } from "./timestamps";

/**
 * A Glifo — the permanent achievement that unlocks linear progression between
 * eras (design document `glifos-e-portais`).
 *
 * This is a table and not a string on `map_connections` for the same reason
 * every other foreign key here goes by code: an unknown code answers 422 and
 * names the valid options, while free text answers nothing. A typo in a
 * required glyph would otherwise produce a portal no player can ever open,
 * with no error anywhere — the guardian would simply keep refusing, and the
 * bug would read as a progression design mistake instead of a typo.
 *
 * `code` is what the game compares (`GLF-001`); `name` is what it displays
 * ("Daleth"). Keeping them apart is what lets the alphabet be renamed — the
 * document says the letters are provisional — without touching save data,
 * which stores the code.
 *
 * A Glifo is not consumed, sold, crafted or used as currency, so there is no
 * quantity and no owner column here: possession is player save state in
 * Godot (`PlayerProgress`), never catalog. The catalog says which arena
 * grants it (`npc_duelists.grants_glyph_id`) and which crossing demands it
 * (`map_connections.required_glyph_id`).
 */
export const glyphs = pgTable("glyphs", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  notes: text("notes"),
  ...timestamps,
});

export type Glyph = typeof glyphs.$inferSelect;
export type NewGlyph = typeof glyphs.$inferInsert;
