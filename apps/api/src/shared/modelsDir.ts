import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where creature .glb files physically live. `apps/web` is a sibling of
 * `apps/api` in the monorepo, so this is a fixed relative hop from this
 * file's own location — resolved via `import.meta.url` so it doesn't
 * depend on the process' cwd.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

export const MODELS_DIR = resolve(repoRoot, "apps/web/public/models");

/** Prefix the web app serves `apps/web/public/` under. */
export const MODELS_PUBLIC_PREFIX = "/models";
