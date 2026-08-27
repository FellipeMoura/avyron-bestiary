import {
  readdirSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

/**
 * Prepare the human character kit (Quaternius, CC0) for the game: base bodies,
 * hairstyles, modular outfit parts and the two Universal Animation Libraries,
 * all sharing the SAME 65-bone skeleton (root/pelvis/spine_01…). That shared
 * rig is the whole point — any combination of parts plays any clip, so the
 * player is assembled from a recipe (gender + one part per slot) and an NPC
 * is just a hardcoded recipe of the same parts.
 *
 * Sources: ../exportado-quaternius (local-only, like placeholder_models/ —
 * each dev brings their own copy; the committed output here is the durable
 * artifact). Override with --src <path>.
 *
 * Like the biome kit, parts are NOT packed into .glb: outfit parts share
 * their textures (every Ranger piece references the same T_Ranger_BaseColor
 * by relative URI), and packing would embed a private copy per piece. Kept
 * as .gltf + .bin + shared .png, downscaled to 1024² (sources go up to
 * 4096² — useless detail at the 30°/45° orthographic camera).
 *
 * The two animation libraries ARE .glb (self-contained, texture-less
 * mannequin) and get their clips renamed to the game vocabulary, extending
 * the creature one (Idle, Walk, Run, Attack…) with human verbs (Throw,
 * Consume, Chop, Sit…). Off-theme clips (pistols, driving, zombies, phone)
 * are dropped and their buffer data pruned. The non-RM variants are used —
 * movement is code-driven in the isometric game, root motion would fight it.
 *
 * Two source quirks patched on copy:
 * - The base-body .gltf files reference textures by a `_png.png` suffix that
 *   doesn't exist on disk (T_Eye_Normal_png.png → T_Eye_Normal.png); URIs are
 *   rewritten and the redundant `*_png.png` duplicates are not copied.
 * - Base bodies are renamed Superhero_* → Base_* (buffer URI rewritten to
 *   match) — "Superhero" is the pack's name for the plain body.
 *
 * Output: apps/web/public/models/characters/ + manifest.json (the "cardápio"
 * of slots/parts/clips — what a character creation screen or an NPC recipe
 * can pick from). Mirrored into the Godot repo by `pnpm game:export`
 * (directory-driven, like biomes). Run with `pnpm models:characters`.
 * Idempotent: output is derived; sources are never touched.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const srcFlag = process.argv.indexOf("--src");
const SOURCE_DIR =
  srcFlag !== -1 && process.argv[srcFlag + 1]
    ? resolve(process.argv[srcFlag + 1])
    : resolve(repoRoot, "../exportado-quaternius");

const OUT_DIR = resolve(repoRoot, "apps/web/public/models/characters");
const URL_PREFIX = "/models/characters";
const MAX_TEXTURE_SIZE = 1024;

const SRC = {
  ual1: "Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb",
  ual2: "Universal Animation Library 2[Standard]/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb",
  bodies:
    "Universal Base Characters[Standard]/Universal Base Characters[Standard]/Base Characters/Godot - UE",
  hair: "Universal Base Characters[Standard]/Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)",
  outfits:
    "Modular Character Outfits - Fantasy[Standard]/Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Modular Parts",
};

if (!existsSync(SOURCE_DIR)) {
  console.error(`source dir not found: ${SOURCE_DIR} (use --src <path>)`);
  process.exit(1);
}
for (const [key, rel] of Object.entries(SRC)) {
  if (!existsSync(join(SOURCE_DIR, rel))) {
    console.error(`missing source for '${key}': ${join(SOURCE_DIR, rel)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// animation libraries
// ---------------------------------------------------------------------------

/**
 * Source clip → canonical name, per library. Unmapped clips keep their source
 * name (already descriptive: Sword_Block, Farm_Harvest…); clips in DROP are
 * removed outright. The two maps must not produce the same canonical name
 * twice ACROSS libraries — in Godot both merge onto one skeleton's animation
 * list, and a duplicate would shadow silently (checked below, fails loudly).
 */
const CLIP_MAP_UAL1 = {
  Idle_Loop: "Idle",
  Walk_Loop: "Walk",
  Jog_Fwd_Loop: "Run",
  Sprint_Loop: "Sprint",
  Punch_Cross: "Attack",
  Punch_Jab: "Attack2",
  Hit_Chest: "HitReact",
  Hit_Head: "HitReact2",
  Death01: "Death",
  Jump_Start: "Jump",
  Jump_Loop: "Jump_Idle",
  Jump_Land: "Jump_Land",
  Interact: "Interact",
  PickUp_Table: "PickUp",
  Idle_Talking_Loop: "Talk",
  Sitting_Enter: "Sit_Enter",
  Sitting_Idle_Loop: "Sit",
  Sitting_Talking_Loop: "Sit_Talk",
  Sitting_Exit: "Sit_Exit",
  Crouch_Idle_Loop: "Crouch",
  Crouch_Fwd_Loop: "Crouch_Walk",
  Swim_Idle_Loop: "Swim_Idle",
  Swim_Fwd_Loop: "Swim",
  Spell_Simple_Enter: "Cast_Enter",
  Spell_Simple_Idle_Loop: "Cast_Idle",
  Spell_Simple_Shoot: "Cast",
  Spell_Simple_Exit: "Cast_Exit",
  Push_Loop: "Push",
  Roll: "Roll",
  Dance_Loop: "Dance",
};

const CLIP_MAP_UAL2 = {
  OverhandThrow: "Throw",
  Consume: "Consume",
  TreeChopping_Loop: "Chop",
  Farm_Harvest: "Harvest",
  Farm_PlantSeed: "Plant",
  Farm_Watering: "Water",
  ClimbUp_1m: "Climb",
  Hit_Knockback: "Knockback",
  Melee_Hook: "Attack3",
  Walk_Carry_Loop: "Walk_Carry",
  Yes: "Yes",
  Idle_No_Loop: "No",
};

const DROP = new Set([
  "A_TPose",
  "Driving_Loop",
  "Pistol_Aim_Down",
  "Pistol_Aim_Neutral",
  "Pistol_Aim_Up",
  "Pistol_Idle_Loop",
  "Pistol_Reload",
  "Pistol_Shoot",
  "Idle_TalkingPhone_Loop",
  "Zombie_Idle_Loop",
  "Zombie_Scratch",
  "Zombie_Walk_Fwd_Loop",
]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const mb = (n) => (n / 1024 / 1024).toFixed(1);
const manifest = { animations: [], bodies: [], hair: [], outfitParts: [] };
const allCanonical = new Map(); // canonical clip → library that claimed it

async function convertLibrary(name, srcRel, clipMap) {
  const srcPath = join(SOURCE_DIR, srcRel);
  const doc = await io.read(srcPath);
  const root = doc.getRoot();
  let dropped = 0;
  const kept = [];

  for (const anim of root.listAnimations()) {
    const source = anim.getName();
    if (DROP.has(source)) {
      for (const channel of anim.listChannels()) channel.dispose();
      for (const sampler of anim.listSamplers()) sampler.dispose();
      anim.dispose();
      dropped += 1;
      continue;
    }
    const canonical = clipMap[source] ?? source;
    if (allCanonical.has(canonical)) {
      console.error(
        `clip collision across libraries: '${canonical}' claimed by ${allCanonical.get(canonical)} and ${name} — aborting`,
      );
      process.exit(1);
    }
    allCanonical.set(canonical, name);
    anim.setName(canonical);
    kept.push(canonical);
  }

  // Mini-prune: disposing animations leaves their accessors orphaned in the
  // root, and NodeIO writes every listed accessor — the dropped clips would
  // still weigh in the binary. An accessor whose only parent is the Root is
  // unreachable; dispose it so the repacked buffer shrinks.
  let orphans = 0;
  for (const accessor of root.listAccessors()) {
    if (accessor.listParents().every((p) => p.propertyType === "Root")) {
      accessor.dispose();
      orphans += 1;
    }
  }

  const outPath = join(OUT_DIR, "animations", `${name}.glb`);
  mkdirSync(dirname(outPath), { recursive: true });
  await io.write(outPath, doc);

  const before = readFileSync(srcPath).byteLength;
  const after = readFileSync(outPath).byteLength;
  console.log(
    `  ${name}.glb  ${kept.length} clips (${dropped} dropped, ${orphans} accessors pruned)  ${mb(before)} MB → ${mb(after)} MB`,
  );
  manifest.animations.push({
    name,
    url: `${URL_PREFIX}/animations/${name}.glb`,
    clips: kept.sort(),
  });
}

console.log("animation libraries:");
await convertLibrary("UAL1", SRC.ual1, CLIP_MAP_UAL1);
await convertLibrary("UAL2", SRC.ual2, CLIP_MAP_UAL2);

// ---------------------------------------------------------------------------
// mesh folders (bodies, hair, outfit parts) — biome-style copy
// ---------------------------------------------------------------------------

let texBefore = 0;
let texAfter = 0;

async function copyTexture(src, dest) {
  const input = readFileSync(src);
  const out = await sharp(input)
    .resize(MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(dest, out);
  texBefore += input.byteLength;
  texAfter += out.byteLength;
}

/** Fix the pack's broken `_png.png` image URIs (file shipped without suffix). */
function fixImageUris(gltf, srcDir) {
  const fixes = [];
  for (const image of gltf.images ?? []) {
    if (!image.uri) continue;
    const fixed = image.uri.replace(/_png\.png$/, ".png");
    if (fixed !== image.uri && existsSync(join(srcDir, fixed))) {
      fixes.push(`${image.uri}→${fixed}`);
      image.uri = fixed;
    }
  }
  return fixes;
}

/**
 * Copy one .gltf (+ its .bin) into destDir, optionally renamed. Renaming
 * rewrites the buffer URI to match; image URIs pass through fixImageUris.
 * Returns the list of image URIs the copied file references.
 */
function copyGltf(srcDir, file, destDir, newName) {
  const gltf = JSON.parse(readFileSync(join(srcDir, file), "utf8"));
  const fixes = fixImageUris(gltf, srcDir);
  const base = newName ?? basename(file, ".gltf");

  for (const buffer of gltf.buffers ?? []) {
    if (!buffer.uri) continue;
    copyFileSync(join(srcDir, buffer.uri), join(destDir, `${base}.bin`));
    buffer.uri = `${base}.bin`;
  }
  writeFileSync(join(destDir, `${base}.gltf`), JSON.stringify(gltf));
  if (fixes.length) console.log(`    ${base}.gltf  URIs corrigidas: ${fixes.join(", ")}`);
  return (gltf.images ?? []).map((i) => i.uri).filter(Boolean);
}

async function copyFolderTextures(srcDir, destDir, referenced) {
  for (const file of readdirSync(srcDir).sort()) {
    if (!file.endsWith(".png")) continue;
    if (!referenced.has(file)) continue; // skips the redundant *_png.png duplicates
    await copyTexture(join(srcDir, file), join(destDir, file));
  }
}

// bodies — renamed Superhero_* → Base_*
console.log("\nbodies:");
{
  const srcDir = join(SOURCE_DIR, SRC.bodies);
  const destDir = join(OUT_DIR, "bodies");
  mkdirSync(destDir, { recursive: true });
  const referenced = new Set();
  for (const [file, gender] of [
    ["Superhero_Male_FullBody.gltf", "male"],
    ["Superhero_Female_FullBody.gltf", "female"],
  ]) {
    const newName = gender === "male" ? "Base_Male" : "Base_Female";
    for (const uri of copyGltf(srcDir, file, destDir, newName)) referenced.add(uri);
    manifest.bodies.push({ gender, name: newName, url: `${URL_PREFIX}/bodies/${newName}.gltf` });
    console.log(`  ${newName}.gltf`);
  }
  await copyFolderTextures(srcDir, destDir, referenced);
}

// hairstyles (skinned to the head bone of the same skeleton)
console.log("\nhair:");
{
  const srcDir = join(SOURCE_DIR, SRC.hair);
  const destDir = join(OUT_DIR, "hair");
  mkdirSync(destDir, { recursive: true });
  const referenced = new Set();
  const slotOf = (name) =>
    name.startsWith("Eyebrows") ? "eyebrows" : name === "Hair_Beard" ? "beard" : "hair";
  for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".gltf")).sort()) {
    const name = basename(file, ".gltf");
    for (const uri of copyGltf(srcDir, file, destDir)) referenced.add(uri);
    manifest.hair.push({ slot: slotOf(name), name, url: `${URL_PREFIX}/hair/${name}.gltf` });
    console.log(`  ${name}.gltf  (${slotOf(name)})`);
  }
  await copyFolderTextures(srcDir, destDir, referenced);
}

// modular outfit parts — filename encodes gender/outfit/slot
console.log("\noutfit parts:");
{
  const srcDir = join(SOURCE_DIR, SRC.outfits);
  const destDir = join(OUT_DIR, "outfits");
  mkdirSync(destDir, { recursive: true });
  const referenced = new Set();
  const SLOT = { Body: "body", Arms: "arms", Legs: "legs", Feet: "feet", Head: "head", Acc: "accessory" };
  for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".gltf")).sort()) {
    const name = basename(file, ".gltf");
    const [gender, outfit, slotKey] = name.split("_");
    const slot = SLOT[slotKey];
    if (!slot) {
      console.error(`  ${name}: slot desconhecido '${slotKey}' — ajuste o mapa SLOT`);
      process.exit(1);
    }
    for (const uri of copyGltf(srcDir, file, destDir)) referenced.add(uri);
    manifest.outfitParts.push({
      gender: gender.toLowerCase(),
      outfit: outfit.toLowerCase(),
      slot,
      name,
      url: `${URL_PREFIX}/outfits/${name}.gltf`,
    });
    console.log(`  ${name}.gltf  (${gender.toLowerCase()}/${outfit.toLowerCase()}/${slot})`);
  }
  await copyFolderTextures(srcDir, destDir, referenced);
}

// ---------------------------------------------------------------------------
// head-only body variants
// ---------------------------------------------------------------------------

/**
 * O tier gratuito do pack traz o corpo base como UMA malha (cabeça inclusa).
 * O Readme dos outfits manda usar "only the head" sob a roupa — na versão
 * Source isso é apagar vértices no .blend; aqui é derivado: um Head_* por
 * gênero com a malha de pele cortada pelos PESOS DE SKINNING. Vértice cuja
 * soma de pesos nos ossos do conjunto cabeça (Head + descendentes + neck_01/02)
 * passa de 0.5 fica; triângulo só sobrevive com os três vértices dentro. A
 * costura resultante segue a fronteira de skinning pescoço/tórax, que é
 * exatamente onde os colarinhos das peças Body cobrem. Olhos e sobrancelhas
 * são malhas próprias e ficam inteiros.
 *
 * O corte é por corte de índices, não de vértices: os vértices do tronco
 * continuam no buffer, só deixam de ser referenciados — simples e suficiente,
 * o peso morto é ~100 KB por corpo.
 */
const HEAD_WEIGHT_THRESHOLD = 0.5;
const SKIN_MESH_NODE = { Base_Male: "SuperHero_Male", Base_Female: "Superhero_Female" };

async function buildHeadVariant(baseName, headName) {
  const doc = await io.read(join(OUT_DIR, "bodies", `${baseName}.gltf`));
  const root = doc.getRoot();

  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const headSet = new Set();
  const headRoot = joints.find((j) => j.getName() === "Head");
  const markSubtree = (node) => {
    headSet.add(joints.indexOf(node));
    for (const child of node.listChildren()) if (joints.includes(child)) markSubtree(child);
  };
  if (headRoot) markSubtree(headRoot);
  for (const name of ["neck_01", "neck_02"]) {
    const j = joints.find((n) => n.getName() === name);
    if (j) headSet.add(joints.indexOf(j));
  }
  if (headSet.size === 0) {
    console.error(`  ${baseName}: esqueleto sem osso Head — variante não gerada`);
    process.exit(1);
  }

  const skinNode = root.listNodes().find((n) => n.getName() === SKIN_MESH_NODE[baseName]);
  if (!skinNode?.getMesh()) {
    console.error(`  ${baseName}: nó de malha de pele '${SKIN_MESH_NODE[baseName]}' não encontrado`);
    process.exit(1);
  }

  for (const prim of skinNode.getMesh().listPrimitives()) {
    const jointsAttr = prim.getAttribute("JOINTS_0").getArray();
    const weightsAttr = prim.getAttribute("WEIGHTS_0").getArray();
    const indices = prim.getIndices().getArray();

    const vertexPasses = (v) => {
      let w = 0;
      for (let c = 0; c < 4; c += 1) {
        if (headSet.has(jointsAttr[v * 4 + c])) w += weightsAttr[v * 4 + c];
      }
      return w >= HEAD_WEIGHT_THRESHOLD;
    };

    const kept = [];
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      if (vertexPasses(a) && vertexPasses(b) && vertexPasses(c)) kept.push(a, b, c);
    }
    const newIndices = doc
      .createAccessor()
      .setArray(new Uint32Array(kept))
      .setType("SCALAR")
      .setBuffer(root.listBuffers()[0]);
    const old = prim.getIndices();
    prim.setIndices(newIndices);
    old.dispose();
    console.log(
      `  ${headName}: pele ${indices.length / 3} → ${kept.length / 3} triângulos (cabeça)`,
    );
  }

  // URI própria para o buffer: sem isto o write reaproveita a URI de origem
  // (Base_*.bin) e SOBRESCREVE o bin do corpo base com o buffer reempacotado
  // da variante — corrompendo o par do Base_*.gltf, que ainda descreve o
  // layout antigo. Foi exatamente assim que o import do Godot passou a
  // crashar só nos corpos base.
  root.listBuffers().forEach((b) => b.setURI(`${headName}.bin`));
  await io.write(join(OUT_DIR, "bodies", `${headName}.gltf`), doc);
  return `${URL_PREFIX}/bodies/${headName}.gltf`;
}

console.log("\nhead variants:");
for (const body of manifest.bodies) {
  const headName = body.gender === "male" ? "Head_Male" : "Head_Female";
  body.headUrl = await buildHeadVariant(body.name, headName);
}

// ---------------------------------------------------------------------------
// verify + manifest
// ---------------------------------------------------------------------------

/** Every image URI referenced by every copied .gltf must exist in the output. */
let broken = 0;
for (const dir of ["bodies", "hair", "outfits"]) {
  const outSub = join(OUT_DIR, dir);
  for (const file of readdirSync(outSub).filter((f) => f.endsWith(".gltf"))) {
    const gltf = JSON.parse(readFileSync(join(outSub, file), "utf8"));
    for (const uri of [
      ...(gltf.buffers ?? []).map((b) => b.uri),
      ...(gltf.images ?? []).map((i) => i.uri),
    ]) {
      if (uri && !existsSync(join(outSub, uri))) {
        console.error(`BROKEN: ${dir}/${file} references missing ${uri}`);
        broken += 1;
      }
    }
  }
}
if (broken > 0) process.exit(1);

writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 1));

console.log(
  `\ndone: ${manifest.animations.length} animation libs, ${manifest.bodies.length} bodies, ` +
    `${manifest.hair.length} hair/face, ${manifest.outfitParts.length} outfit parts` +
    `\ntexturas ${mb(texBefore)} MB → ${mb(texAfter)} MB, em ${OUT_DIR}`,
);
