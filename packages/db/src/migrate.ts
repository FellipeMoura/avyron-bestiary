import "./loadEnv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const migrationClient = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
await migrationClient.end();

console.log("migrations applied");
