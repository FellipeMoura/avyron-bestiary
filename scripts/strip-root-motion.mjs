import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { stripRootMotion } from "./lib/root-motion.mjs";

/**
 * Remove root motion de `.glb` JÁ convertidos, no lugar.
 *
 * `convert-meshy.mjs` faz isso em todo export novo desde 2026-09-07 — mas os
 * corpos de criatura do PZ-01 foram convertidos no dia anterior, e chegaram
 * ao jogo com `Swim`, `Attack2` e `Death` andando de 1,0 a 1,7 m por ciclo.
 * O sintoma foi a companheira "nadando mais rápido e resetando" a cada volta
 * do clipe. Reconverter exigiria o export bruto do Meshy, que não está mais no
 * disco; a correção é a mesma rampa linear de `lib/root-motion.mjs`, aplicada
 * ao arquivo otimizado (o round-trip preserva o KTX2).
 *
 * Idempotente: um clipe já in-place tem deriva ~0 contra a própria excursão e
 * passa intocado. Guarda o original em `apps/web/.model-backups/pre-strip/`
 * se ainda não estiver lá. Depois: `pnpm game:export`.
 *
 *     node scripts/strip-root-motion.mjs apps/web/public/models/CRT-001.glb [...]
 *     node scripts/strip-root-motion.mjs --dry-run apps/web/public/models/CRT-*.glb
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const BACKUP_DIR = resolve(repoRoot, "apps/web/.model-backups/pre-strip");

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const files = args.filter((a) => !a.startsWith("--")).map((f) => resolve(repoRoot, f));
  if (files.length === 0) {
    console.error("uso: node scripts/strip-root-motion.mjs [--dry-run] <arquivo.glb> [...]");
    process.exit(1);
  }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  let touched = 0;
  for (const file of files) {
    const label = basename(file);
    if (!existsSync(file)) {
      console.error(`${label}: não encontrado`);
      process.exit(1);
    }
    const doc = await io.read(file);
    const stripped = stripRootMotion(doc);
    if (stripped.length === 0) {
      console.log(`${label.padEnd(12)} in-place, nada a fazer`);
      continue;
    }
    console.log(`${label.padEnd(12)} root motion removida de: ${stripped.join(", ")}`);
    if (dryRun) continue;
    mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = join(BACKUP_DIR, label);
    if (!existsSync(backup)) copyFileSync(file, backup);
    await io.write(file, doc);
    touched += 1;
  }
  if (dryRun) console.log("\n--dry-run: nada gravado");
  else if (touched > 0) console.log(`\n${touched} arquivo(s) gravado(s) — próximo passo: pnpm game:export`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
