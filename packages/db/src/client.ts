import "./loadEnv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

/**
 * Long-lived postgres pool. The Drizzle client below wraps it and exposes
 * the schema via `db.query.<table>` for typed reads.
 */
export const sql = postgres(process.env.DATABASE_URL, { max: 10 });
export const db = drizzle(sql, { schema });

export type Database = typeof db;
