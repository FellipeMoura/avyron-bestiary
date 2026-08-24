import { readdirSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

/**
 * Prepare the biome placeholder kit (Quaternius Stylized Nature MegaKit, CC0)
 * for the game: copy the glTF props into the servable models tree with their
 * textures downscaled.
 *
 * Unlike the creature placeholders, these are NOT packed into single .glb
 * files, on purpose: the kit shares its textures across models (every
 * CommonTree references the same Bark_NormalTree.png by relative URI), and
 * packing would embed a private copy of the bark in each tree — hundreds of
 * MB of duplicated VRAM once Godot imports them. Kept as .gltf + .bin +
 * shared .png, both the disk and the imported resources stay deduplicated.
 *
 * The downscale (max 1024²) is what actually matters: the source textures
 * are up to 4096² / 5.6 MB, useless detail at the 30°/45° orthographic
 * camera, and 4096² costs ~89 MB of VRAM against ~5.6 MB at 1024².
 *
 * Output: apps/web/public/models/biomes/megakit/ — mirrored into the Godot
 * repo by `pnpm game:export` (directory-driven, unlike creature models which
 * are modelUrl-driven). Run with `pnpm models:biomes`. Idempotent: output is
 * derived; sources are never touched.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const SOURCE_DIR = resolve(
  repoRoot,
  "placeholder_models/biomes/Stylized Nature MegaKit[Standard]/glTF",
);
const OUT_DIR = resolve(repoRoot, "apps/web/public/models/biomes/megakit");

const MAX_TEXTURE_SIZE = 1024;

if (!existsSync(SOURCE_DIR)) {
  console.error(`source dir not found: ${SOURCE_DIR}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(SOURCE_DIR).sort();
const mb = (n) => (n / 1024 / 1024).toFixed(1);

let models = 0;
let texBefore = 0;
let texAfter = 0;

for (const file of files) {
  const src = join(SOURCE_DIR, file);
  const dest = join(OUT_DIR, file);
  const ext = extname(file).toLowerCase();

  if (ext === ".gltf" || ext === ".bin") {
    copyFileSync(src, dest);
    if (ext === ".gltf") models += 1;
  } else if (ext === ".png") {
    const input = readFileSync(src);
    const out = await sharp(input)
      .resize(MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(dest, out);
    texBefore += input.byteLength;
    texAfter += out.byteLength;
    console.log(`  ${file.padEnd(32)} ${mb(input.byteLength).padStart(5)} MB → ${mb(out.byteLength).padStart(5)} MB`);
  }
}

console.log(
  `\ndone: ${models} modelos, texturas ${mb(texBefore)} MB → ${mb(texAfter)} MB, em ${OUT_DIR}`,
);

// ---------------------------------------------------------------------------
// aquáticos (Meshy) — props do PZ-01
// ---------------------------------------------------------------------------

/**
 * Diferente do MegaKit, cada prop do Meshy carrega textura própria — não há
 * compartilhamento a preservar, então aqui o empacotamento em .glb único é o
 * formato certo. O tratamento é o do pipeline Meshy em miniatura: texturas
 * 2048² → 1024² (o que corta ~75% da VRAM), e o emissivo passa pela mesma
 * checagem do optimize-models.mjs — remover a textura exige zerar o
 * emissiveFactor junto, senão o prop vira silhueta branca chapada.
 *
 * A geometria chega normalizada em ~1×1×1 pelo Meshy; a escala real de cada
 * prop é decisão da cena no Godot, não daqui.
 */
const AQUA_SRC = resolve(repoRoot, "placeholder_models/biomes/aquaticos-meshy");
const AQUA_OUT = resolve(repoRoot, "apps/web/public/models/biomes/aquatic");
const EMISSIVE_BLACK_PEAK = 8;

/** O único arquivo do lote que o Meshy exportou sem nome no meio. */
const AQUA_RENAME = { "Meshy_AI__0824195641_texture": "Reef_Cluster" };

function cleanAquaName(file) {
  const base = basename(file, ".glb");
  if (AQUA_RENAME[base]) return AQUA_RENAME[base];
  return base.replace(/^Meshy_AI_/, "").replace(/_\d+_texture$/, "");
}

async function texturePeak(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let max = 0;
  for (let i = 0; i < info.width * info.height; i += 1) {
    for (let c = 0; c < Math.min(info.channels, 3); c += 1) {
      if (data[i * info.channels + c] > max) max = data[i * info.channels + c];
    }
  }
  return max;
}

if (existsSync(AQUA_SRC)) {
  mkdirSync(AQUA_OUT, { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  let aquaModels = 0;

  console.log("\naquáticos (Meshy):");
  for (const file of readdirSync(AQUA_SRC).filter((f) => f.endsWith(".glb")).sort()) {
    const doc = await io.read(join(AQUA_SRC, file));
    const root = doc.getRoot();
    const notes = [];

    // Emissivo primeiro, para não gastar resize num mapa prestes a cair.
    for (const material of root.listMaterials()) {
      const texture = material.getEmissiveTexture();
      if (!texture) continue;
      const peak = await texturePeak(texture.getImage());
      if (peak <= EMISSIVE_BLACK_PEAK) {
        material.setEmissiveTexture(null);
        material.setEmissiveFactor([0, 0, 0]);
        notes.push(`emissivo removido (pico ${peak}/255)`);
      } else {
        notes.push(`emissivo mantido (pico ${peak}/255)`);
      }
    }

    for (const texture of root.listTextures()) {
      const image = texture.getImage();
      if (!image) continue;
      const isPng = texture.getMimeType() === "image/png";
      const pipeline = sharp(image).resize(1024, 1024, { fit: "inside", withoutEnlargement: true });
      const out = isPng
        ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
        : await pipeline.jpeg({ quality: 85 }).toBuffer();
      texture.setImage(new Uint8Array(out));
    }

    const unsafe = root
      .listMaterials()
      .some((m) => !m.getEmissiveTexture() && Math.max(...m.getEmissiveFactor()) > 0);
    if (unsafe) {
      console.log(`  ${file} FAIL emissiveFactor sem textura — não gravado`);
      continue;
    }

    const name = cleanAquaName(file);
    await io.write(join(AQUA_OUT, `${name}.glb`), doc);
    aquaModels += 1;
    console.log(`  ${name.padEnd(24)} ok${notes.length ? "  (" + notes.join("; ") + ")" : ""}`);
  }
  console.log(`aquáticos: ${aquaModels} modelos em ${AQUA_OUT}`);
}
