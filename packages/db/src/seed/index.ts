import { resolveFromRepoRoot } from "../loadEnv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { db, sql } from "../client";
import { seedPaleozoicBatch1 } from "./content/paleozoic-batch-1";
import { seedReferenceData } from "./content/reference-data";
import { noteDevLog, seedBible, seedRoadmap } from "./docx";
import { seedXlsx } from "./xlsx";

/**
 * FROZEN — bootstrap only. Do not add new content batches here.
 *
 * This script existed to get the corpus off the original .docx/.xlsx before
 * the first deploy. That job is done. Since then the API is the write path:
 * every change carries `reason`/`impact` and lands in the changelog, which
 * is the audit trail. Content committed as TypeScript has neither.
 *
 * Where things go now:
 *   - new data or corrections  → API (`POST`/`PATCH`/`DELETE`, batch endpoints
 *     for bulk), which versions the change automatically
 *   - schema changes           → drizzle migrations, as always
 *   - hydrating a dev machine  → `pnpm db:pull`, which snapshots prod
 *
 * What remains below is kept so a fresh clone can still bootstrap offline.
 * It is idempotent — rerunning it does not duplicate rows.
 *
 * IMPORTANT: this script writes directly through the ORM and does NOT go
 * through the API's terminology validator. The historical Development Log
 * (versions 0.02 and 0.04) intentionally contains the discontinued terms
 * "Evolução" and "Forma Ancestral" because they document their own
 * deprecation. That is expected and must be preserved.
 */

// FONTES_DIR from env is relative to the monorepo root (where .env lives),
// not to the CWD — pnpm runs scripts inside their package, so plain resolve()
// would look inside packages/db/fontes/.
const FONTES_DIR = resolveFromRepoRoot(process.env.FONTES_DIR ?? "./fontes");

async function main(): Promise<void> {
  console.log(`fontes: ${FONTES_DIR}`);

  const xlsx = resolve(FONTES_DIR, "02_Game_Database.xlsx");
  const bible = resolve(FONTES_DIR, "01_Game_Design_Bible.docx");
  const devlog = resolve(FONTES_DIR, "03_Development_Log.docx");
  const roadmap = resolve(FONTES_DIR, "04_Roadmap.docx");

  if (existsSync(xlsx)) await seedXlsx(db, xlsx);
  else console.warn(`[skip] ${xlsx} not found`);

  // Curated content batches — reference data first so subsequent batches
  // find the FK codes they need. seedReferenceData is idempotent, so it's
  // safe to run even when the xlsx above already covered these tables.
  console.log("curated content:");
  await seedReferenceData(db);
  await seedPaleozoicBatch1(db);

  if (existsSync(bible)) await seedBible(db, bible);
  else console.warn(`[skip] ${bible} not found`);

  if (existsSync(devlog)) await noteDevLog(devlog);
  if (existsSync(roadmap)) await seedRoadmap(db, roadmap);
  else console.warn(`[skip] ${roadmap} not found`);

  console.log("seed done.");
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
