import "./loadEnv";
import { runMigrations } from "./runMigrations";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const applied = await runMigrations(process.env.DATABASE_URL);
console.log(applied === 0 ? "migrations applied (nada pendente)" : "migrations applied");
