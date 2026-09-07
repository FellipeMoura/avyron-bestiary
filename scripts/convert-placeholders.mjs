import { readdirSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

/**
 * Convert placeholder packs (Quaternius, CC0) into servable .glb files
 * with animation clip names normalized to a single vocabulary. Source is
 * `.gltf` for packs that ship it directly, or `.glb` for packs that don't
 * (EasyAnimated/ — the pack only ships .fbx/.obj/.blend, converted to .glb
 * by Godot beforehand, since no Node lib here reads .fbx; see
 * `avyron/scripts/dev/convert_easy_pack.gd`). gltf-transform reads both
 * identically, so the rest of this script doesn't care which one a given
 * file is.
 *
 * The packs speak different animation dialects — the ground monsters say
 * `Punch`/`Run`, the flyers say `Flying_Idle`/`Fast_Flying`, the quadrupeds say
 * `Attack_Kick`/`Gallop` (and disagree on `Jump_toIdle` vs `Jump_ToIdle`
 * between themselves), EasyAnimated says `Rat_Run`/`Wasp_Flying` — already
 * renamed to canonical names by the FBX→glb conversion step, so `CLIP_MAP`
 * below has nothing left to do for that group and every clip passes through
 * unmapped-but-already-correct. Normalizing here means the game (and any
 * future reader) addresses every model by the same clip names and never
 * learns the packs existed.
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
  // .glb entra pelo mesmo caminho que .gltf — gltf-transform lê os dois
  // igual. É o formato de saída de fontes que não chegam em .gltf pronto
  // (ver EasyAnimated/, convertido de .fbx pelo Godot em
  // `avyron/scripts/dev/convert_easy_pack.gd`, porque nenhuma lib Node do
  // bestiário lê .fbx).
  const files = readdirSync(srcDir)
    .filter((f) => [".gltf", ".glb"].includes(f.toLowerCase().slice(f.lastIndexOf("."))))
    .sort();

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

    const name = basename(file, extname(file));
    const outPath = join(outGroupDir, `${name}.glb`);
    if (!DRY) {
      mkdirSync(outGroupDir, { recursive: true });
      await io.write(outPath, doc);
    }

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

/**
 * MESCLA no manifest existente — substitui só as entradas dos GRUPOS que esta
 * rodada realmente escaneou, preserva o resto intocado. Escrever por cima
 * incondicionalmente destruiria os grupos cujo `placeholder_models/<Group>/`
 * não existe NESTA máquina: a pasta fonte é local-only (cada dev traz a
 * própria cópia, nunca commitada), então rodar com só ALGUNS grupos presentes
 * — o caso comum, não a exceção — apagaria o manifest inteiro e deixaria só
 * o que essa máquina por acaso tinha. Foi exatamente o que aconteceu na
 * prática: rodar com só `EasyAnimated/` presente reduziu 44 entradas
 * (big/flying/quadruped, geradas em outra hora/máquina) para 6.
 */
if (!DRY && manifest.length > 0) {
  const scannedGroups = new Set(groups.map((g) => g.toLowerCase()));
  let existing = [];
  if (existsSync(join(OUT_DIR, "manifest.json"))) {
    existing = JSON.parse(readFileSync(join(OUT_DIR, "manifest.json"), "utf8"));
  }
  const merged = existing.filter((m) => !scannedGroups.has(m.group)).concat(manifest);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(merged, null, 1));
  console.log(`\nmanifest.json: ${manifest.length} models nesta rodada, ${merged.length} no total`);
}

console.log(`\ndone: ${converted} converted, ${skipped} skipped, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
