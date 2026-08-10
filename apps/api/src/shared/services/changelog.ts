import { desc, sql } from "drizzle-orm";
import { schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";

type Tx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Reads the current maximum version and returns the next one in the "0.NN"
 * format used across the project. 0.10 → 0.11 → 0.12 → ... → 0.99 → 0.100.
 * The server picks the version; agents never do.
 *
 * Uses a plain `MAX(...)` over string column with a numeric cast on the
 * minor part. Postgres sorts "0.10" < "0.9" lexicographically, so string
 * ordering is not safe.
 */
export async function computeNextVersion(tx: Tx): Promise<string> {
  const rows = await tx
    .select({
      minor: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(${schema.changelog.version}, '.', 2) AS INTEGER)), 0)`,
    })
    .from(schema.changelog);
  const nextMinor = (rows[0]?.minor ?? 0) + 1;
  return `0.${String(nextMinor).padStart(2, "0")}`;
}

export interface ChangelogEntry {
  change: string;
  reason: string;
  impact: string;
  entity?: string;
  entityId?: number;
}

/**
 * Inserts a changelog row inside the caller's transaction with the auto
 * version. Returns the assigned version so it can be echoed in the response.
 */
export async function recordChange(tx: Tx, entry: ChangelogEntry): Promise<string> {
  const version = await computeNextVersion(tx);
  await tx.insert(schema.changelog).values({
    version,
    change: entry.change,
    reason: entry.reason,
    impact: entry.impact,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
  });
  return version;
}

/**
 * Convenience getter for `GET /context` and similar summaries.
 */
export async function lastVersions(db: Database, limit = 5) {
  return db
    .select({
      version: schema.changelog.version,
      date: schema.changelog.date,
      change: schema.changelog.change,
      reason: schema.changelog.reason,
      impact: schema.changelog.impact,
    })
    .from(schema.changelog)
    .orderBy(desc(schema.changelog.date), desc(schema.changelog.id))
    .limit(limit);
}
