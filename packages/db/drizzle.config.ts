import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// Walk upwards from this file to find the monorepo .env — drizzle-kit runs
// with the package as CWD, so a relative `.env` wouldn't be found.
let dir = __dirname;
for (let i = 0; i < 20; i++) {
  const candidate = resolve(dir, ".env");
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
  const parent = dirname(dir);
  if (parent === dir) break;
  dir = parent;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (set it in the root .env file)");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL },
  verbose: true,
  strict: true,
});
