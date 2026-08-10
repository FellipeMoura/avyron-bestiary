import { date, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { documentStatusEnum } from "./enums";
import { timestamps } from "./timestamps";

/**
 * Chapters of the Design Bible plus standalone documents like the Roadmap.
 * Body is markdown to keep token cost low for LLM consumers.
 *
 * Table is `design_documents` (not `documents`) to avoid clashing with the
 * DOM `Document` type in generated frontend clients.
 */
export const designDocuments = pgTable("design_documents", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  status: documentStatusEnum("status").notNull().default("pending"),
  bodyMarkdown: text("body_markdown").notNull().default(""),
  ...timestamps,
});

/**
 * One row per API-driven change. Version is server-assigned; agents never
 * pick it. `reason` and `impact` are required on every write and land here
 * inside the same transaction as the change.
 *
 * `entity` and `entityId` are polymorphic — populated when the change
 * targets a specific record, null for global changes. Kept as free text +
 * int by design; no cross-table FK.
 */
export const changelog = pgTable("changelog", {
  id: serial("id").primaryKey(),
  version: text("version").notNull().unique(),
  date: date("date", { mode: "date" }).notNull().defaultNow(),
  change: text("change").notNull(),
  reason: text("reason").notNull(),
  impact: text("impact").notNull(),
  entity: text("entity"),
  entityId: integer("entity_id"),
  ...timestamps,
});

export type DesignDocument = typeof designDocuments.$inferSelect;
export type NewDesignDocument = typeof designDocuments.$inferInsert;
export type Changelog = typeof changelog.$inferSelect;
export type NewChangelog = typeof changelog.$inferInsert;
