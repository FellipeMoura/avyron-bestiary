import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Walk upwards from this file until we find a `.env`. Lets any script inside
 * the monorepo pick up the single root-level .env without CWD gymnastics.
 */
function findEnvUpwards(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const here = dirname(fileURLToPath(import.meta.url));
const envPath = findEnvUpwards(here);
if (envPath) {
  config({ path: envPath });
} else {
  config();
}

/** The .env file we loaded, or null if none was found. */
export const envLoadedFrom = envPath;

/**
 * Repo root — the directory holding the .env. Used to resolve any relative
 * paths in env vars (like `FONTES_DIR=./fontes`) against the monorepo root
 * instead of the pnpm-per-package CWD.
 */
export const repoRoot = envPath ? dirname(envPath) : process.cwd();

/** Resolve a value that may be a relative path against the repo root. */
export function resolveFromRepoRoot(p: string): string {
  return resolve(repoRoot, p);
}
