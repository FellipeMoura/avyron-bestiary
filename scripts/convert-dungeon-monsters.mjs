import { readdirSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

/**
 * Prepare "Bestiary - Dungeon Monsters" bodies (Quaternius, CC0) as creature
 * placeholders. Different shape from the other two model pipelines, on
 * purpose — this pack doesn't fit either:
 *
 * - `placeholder_models/` (convert-placeholders.mjs) ships baked, per-pack
 *   animation clips that get renamed to the game vocabulary.
 * - `../exportado-quaternius` (convert-characters.mjs) ships modular human
 *   parts (body/hair/outfit) meant to be composed by recipe.
 *
 * Dungeon Monsters ships single self-contained .glb per body with NO baked
 * animation at all — it shares the SAME skeleton as the human Universal
 * Animation Library, and expects retarget, not a clip rename table. That
 * retarget lives in the Godot repo (`CreatureActor._build_retargeted_animation`,
 * mirroring `CharacterRig._build_library`), not here — this script is
 * intentionally thin: read each .glb just enough to confirm it has no baked
 * animation and to measure height, copy the file byte-for-byte (no
 * gltf-transform re-serialize — nothing here needs rewriting), and write the
 * SAME manifest.json contract `usePlaceholderModels.ts` already reads,
 * merging into (not replacing) what convert-placeholders.mjs wrote.
 *
 * `clips` in the manifest entry is informational, not read from the file —
 * it documents the vocabulary the Godot-side retarget actually makes
 * available (the creature subset, not the full human list: no Sit/Cast/Throw).
 *
 * Source: local-only, like placeholder_models/ and ../exportado-quaternius —
 * each dev brings their own copy of the pack. Override with --src <path>.
 * Output: apps/web/public/models/placeholders/dungeon/*.glb + merged
 * manifest.json. Run with `pnpm models:dungeon`. Idempotent: re-running
 * replaces only the "dungeon" group's entries.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const srcFlag = process.argv.indexOf("--src");
const SOURCE_DIR =
  srcFlag !== -1 && process.argv[srcFlag + 1]
    ? resolve(process.argv[srcFlag + 1])
    : resolve(
        repoRoot,
        "../new-assets/Bestiary - Dungeon Monsters Kit[Standard]/Exports/GLB (Godot-Unreal)",
      );

const OUT_ROOT = resolve(repoRoot, "apps/web/public/models/placeholders");
const GROUP = "dungeon";
const OUT_DIR = join(OUT_ROOT, GROUP);
const MANIFEST_PATH = join(OUT_ROOT, "manifest.json");

/**
 * Vocabulário de CRIATURA que o retarget disponibiliza (ver
 * `CreatureActor.LOOPED_CLIPS` e o combate) — não o vocabulário humano
 * inteiro da UAL (Throw/Sit/Cast/Chop…), que não serve pra um monstro.
 */
const RETARGETED_CLIPS = [
  "Idle",
  "Walk",
  "Run",
  "Jump",
  "Jump_Idle",
  "Jump_Land",
  "Attack",
  "Attack2",
  "HitReact",
  "HitReact2",
  "Death",
  "Swim",
  "Swim_Idle",
];

const DRY = process.argv.includes("--dry");

if (!existsSync(SOURCE_DIR)) {
  console.error(`source dir not found: ${SOURCE_DIR} (use --src <path>)`);
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = readdirSync(SOURCE_DIR)
  .filter((f) => f.toLowerCase().endsWith(".glb"))
  .sort();

if (files.length === 0) {
  console.error(`no .glb files found under ${SOURCE_DIR}`);
  process.exit(1);
}

console.log(`${GROUP}/ ← ${SOURCE_DIR}`);

let converted = 0;
let skipped = 0;
let failed = 0;
const entries = [];

for (const file of files) {
  const name = basename(file, ".glb");

  let doc;
  try {
    doc = await io.read(join(SOURCE_DIR, file));
  } catch (error) {
    console.log(`  ${file.padEnd(24)} FAIL  unreadable: ${error.message}`);
    failed += 1;
    continue;
  }

  const root = doc.getRoot();
  const animations = root.listAnimations();
  if (animations.length > 0) {
    console.log(
      `  ${file.padEnd(24)} SKIP  ${animations.length} clipe(s) embutido(s) — isto e' arquivo de convert-placeholders.mjs, nao deste script`,
    );
    skipped += 1;
    continue;
  }

  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const bounds = scene ? getBounds(scene) : null;
  const height = bounds ? Number((bounds.max[1] - bounds.min[1]).toFixed(2)) : null;

  if (!DRY) {
    mkdirSync(OUT_DIR, { recursive: true });
    copyFileSync(join(SOURCE_DIR, file), join(OUT_DIR, `${name}.glb`));
  }

  entries.push({
    group: GROUP,
    name,
    url: `/models/placeholders/${GROUP}/${name}.glb`,
    clips: RETARGETED_CLIPS,
    height,
  });

  const status = DRY ? "DRY " : "OK  ";
  console.log(`  ${file.padEnd(24)} ${status} sem clipe embutido (retarget), altura ${height}`);
  converted += 1;
}

if (!DRY && entries.length > 0) {
  let manifest = [];
  if (existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  }
  // Substitui só as entradas do GRUPO — re-rodar não duplica nem deixa lixo
  // de um corpo removido do pacote fonte.
  manifest = manifest.filter((m) => m.group !== GROUP).concat(entries);
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 1));
  console.log(`\nmanifest.json: ${entries.length} corpo(s) no grupo '${GROUP}'`);
}

console.log(`\ndone: ${converted} converted, ${skipped} skipped, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
