import { readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

/**
 * Convert placeholder .gltf packs (Quaternius, CC0) into servable .glb files
 * with animation clip names normalized to a single vocabulary.
 *
 * The three packs speak different animation dialects — the ground monsters say
 * `Punch`/`Run`, the flyers say `Flying_Idle`/`Fast_Flying`, the quadrupeds say
 * `Attack_Kick`/`Gallop` (and disagree on `Jump_toIdle` vs `Jump_ToIdle`
 * between themselves). Normalizing here means the game and the viewer address
 * every model by the same clip names and never learn the packs existed.
 *
 * Output: apps/web/public/models/placeholders/<group>/<Name>.glb, plus a
 * manifest.json alongside listing every model (url, clips, height) — the
 * frontend's model picker reads it instead of needing an API endpoint to
 * scan the directory. Run with `pnpm models:placeholders`. Idempotent:
 * output is derived, safe to re-run; sources in placeholder_models/ are
 * never touched.
 *
 * These models are NOT run through models:optimize — their textures are a
 * shared 9 KB palette atlas (or none at all), so KTX2 would buy nothing.
 * optimize-models.mjs only scans the models root, so it ignores this subtree.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const SOURCE_DIR = resolve(repoRoot, "placeholder_models");
const OUT_DIR = resolve(repoRoot, "apps/web/public/models/placeholders");

const DRY = process.argv.includes("--dry");

/**
 * Source clip name → canonical name. One flat table works because no two
 * packs reuse the same source name with different meanings. Canonical
 * vocabulary: Idle, Idle2, IdleLow, Walk, Run, Jump, Jump_Idle, Jump_Land,
 * Attack, Attack2, HitReact, HitReact2, Death, Duck, Wave, Yes, No, Eating.
 */
const CLIP_MAP = {
  // Ground monsters (Big)
  Idle: "Idle",
  Walk: "Walk",
  Run: "Run",
  Punch: "Attack",
  Weapon: "Attack2",
  HitReact: "HitReact",
  Death: "Death",
  Jump: "Jump",
  Jump_Idle: "Jump_Idle",
  Jump_Land: "Jump_Land",
  Duck: "Duck",
  Wave: "Wave",
  Yes: "Yes",
  No: "No",
  // Flyers
  Flying_Idle: "Idle",
  Fast_Flying: "Run",
  Headbutt: "Attack2",
  // Quadrupeds (ungulates and canines)
  Attack: "Attack",
  Attack_Headbutt: "Attack",
  Attack_Kick: "Attack2",
  Gallop: "Run",
  Gallop_Jump: "Jump",
  Jump_toIdle: "Jump_Land",
  Jump_ToIdle: "Jump_Land",
  Idle_2: "Idle2",
  Idle_Headlow: "IdleLow",
  Idle_2_HeadLow: "IdleLow",
  Idle_HitReact1: "HitReact",
  Idle_HitReact2: "HitReact2",
  Eating: "Eating",
};

/**
 * Files not worth converting. Flying/Demon is the ground Demon accidentally
 * exported into the flying pack with a single clip (Flying_Idle) — the
 * complete 14-clip version lives in Big/Demon.
 */
const SKIP = new Set(["Flying/Demon.gltf"]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const groups = readdirSync(SOURCE_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((g) => existsSync(join(SOURCE_DIR, g, "glTF")));

if (groups.length === 0) {
  console.error(`no <Group>/glTF folders found under ${SOURCE_DIR}`);
  process.exit(1);
}

let converted = 0;
let skipped = 0;
let failed = 0;
const manifest = [];

for (const group of groups) {
  const srcDir = join(SOURCE_DIR, group, "glTF");
  const outGroupDir = join(OUT_DIR, group.toLowerCase());
  const files = readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith(".gltf")).sort();

  console.log(`\n${group}/ → placeholders/${group.toLowerCase()}/`);

  for (const file of files) {
    const rel = `${group}/${file}`;
    if (SKIP.has(rel)) {
      console.log(`  ${file.padEnd(24)} SKIP  incomplete export (see script header)`);
      skipped += 1;
      continue;
    }

    let doc;
    try {
      doc = await io.read(join(srcDir, file));
    } catch (error) {
      console.log(`  ${file.padEnd(24)} FAIL  unreadable: ${error.message}`);
      failed += 1;
      continue;
    }

    const root = doc.getRoot();
    const animations = root.listAnimations();
    const renames = [];
    const unknown = [];
    const seen = new Map();
    let collision = null;

    for (const anim of animations) {
      const source = anim.getName();
      const canonical = CLIP_MAP[source];
      if (!canonical) {
        unknown.push(source);
        continue;
      }
      if (seen.has(canonical)) {
        collision = `${seen.get(canonical)} and ${source} both map to ${canonical}`;
        break;
      }
      seen.set(canonical, source);
      if (canonical !== source) renames.push(`${source}→${canonical}`);
      anim.setName(canonical);
    }

    if (collision) {
      console.log(`  ${file.padEnd(24)} FAIL  clip collision: ${collision} — not written`);
      failed += 1;
      continue;
    }

    const scene = root.getDefaultScene() ?? root.listScenes()[0];
    const bounds = scene ? getBounds(scene) : null;
    const height = bounds ? (bounds.max[1] - bounds.min[1]).toFixed(2) : "?";

    const outPath = join(outGroupDir, `${basename(file, ".gltf")}.glb`);
    if (!DRY) {
      mkdirSync(outGroupDir, { recursive: true });
      await io.write(outPath, doc);
    }

    const name = basename(file, ".gltf");
    manifest.push({
      group: group.toLowerCase(),
      name,
      url: `/models/placeholders/${group.toLowerCase()}/${name}.glb`,
      clips: animations.map((a) => a.getName()).sort(),
      height: bounds ? Number((bounds.max[1] - bounds.min[1]).toFixed(2)) : null,
    });

    const status = DRY ? "DRY " : "OK  ";
    console.log(
      `  ${file.padEnd(24)} ${status} ${String(animations.length).padStart(2)} clips, altura ${height}` +
        (unknown.length ? `  [clipes fora do mapa, mantidos: ${unknown.join(", ")}]` : ""),
    );
    converted += 1;
  }
}

if (!DRY && manifest.length > 0) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`\nmanifest.json: ${manifest.length} models`);
}

console.log(`\ndone: ${converted} converted, ${skipped} skipped, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
