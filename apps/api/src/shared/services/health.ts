import { sql } from "drizzle-orm";
import { db } from "@bestiary/db";

/**
 * Cheap liveness + DB reachability probe. Called by `scripts/deploy.sh` in a
 * retry loop right after `pm2 reload`. Kept dependency-free (no changelog
 * lookup, no schema introspection) so it stays fast even under load.
 */
export async function checkHealth(): Promise<{ ok: boolean; db: "up" | "down" }> {
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, db: "up" };
  } catch {
    return { ok: false, db: "down" };
  }
}
