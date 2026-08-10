import { readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { KHRTextureBasisu, ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { encodeToKTX2 } from "ktx2-encoder";

/**
 * Compress creature .glb textures to KTX2/Basis and strip dead emissive maps.
 *
 * Meshy exports 2048² JPEGs at near-maximum quality — ~8 MB per file, of which
 * ~98% is texture. Worse, JPEG only compresses on disk: the GPU decodes every
 * texture to raw RGBA, so an untouched model costs ~89 MB of VRAM regardless of
 * how small the .glb is. KTX2 stays compressed on the GPU, which is the only
 * change that actually moves the runtime number.
 *
 * Run with `pnpm models:optimize` after dropping new .glb files into
 * apps/web/public/models. Idempotent: models already carrying KTX2 textures are
 * skipped, so re-running after adding one file only touches that file.
 *
 * Full rationale and measurements: docs/MODEL_OPTIMIZATION.md
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const MODELS_DIR = resolve(repoRoot, "apps/web/public/models");
const BACKUP_DIR = resolve(repoRoot, "apps/web/.model-backups");

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");

// An emissive map peaking at or below this is black: JPEG noise over a blank
// image, contributing nothing but VRAM. Measured across the first 9 creatures,
// real (if faint) glow peaked at 90 and noise never cleared 17.
const EMISSIVE_BLACK_PEAK = 8;
const EMISSIVE_SIZE = 256;
const EMISSIVE_SIZE_RICH = 512; // for maps that peak above 32

/**
 * ETC1S transcodes to BC1 (0.5 byte/px) and is the right default. Normal maps
 * are the exception: ETC1S mangles them, so they get UASTC (BC7, 1 byte/px)
 * with Zstandard supercompression to keep the download sane.
 */
const CODEC = {
  baseColor: { isUASTC: false, qualityLevel: 220, compressionLevel: 4, isPerceptual: true, isSetKTX2SRGBTransferFunc: true },
  emissive: { isUASTC: false, qualityLevel: 200, compressionLevel: 4, isPerceptual: true, isSetKTX2SRGBTransferFunc: true },
  metallicRoughness: { isUASTC: false, qualityLevel: 235, compressionLevel: 5, isPerceptual: false, isSetKTX2SRGBTransferFunc: false },
  occlusion: { isUASTC: false, qualityLevel: 235, compressionLevel: 5, isPerceptual: false, isSetKTX2SRGBTransferFunc: false },
  normal: {
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    needSupercompression: true,
    enableRDO: true,
    rdoQualityLevel: 1.0,
    isNormalMap: true,
    isPerceptual: false,
    isSetKTX2SRGBTransferFunc: false,
  },
};

// Required in Node — the encoder has no browser ImageDecoder to fall back on.
const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

const mb = (n) => (n / 1024 / 1024).toFixed(2);

async function peakValue(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let max = 0;
  for (let i = 0; i < info.width * info.height; i += 1) {
    for (let c = 0; c < Math.min(ch, 3); c += 1) if (data[i * ch + c] > max) max = data[i * ch + c];
  }
  return max;
}

function texturesBySlot(root) {
  const slots = new Map();
  for (const material of root.listMaterials()) {
    const pbr = [
      ["baseColor", material.getBaseColorTexture()],
      ["metallicRoughness", material.getMetallicRoughnessTexture()],
      ["normal", material.getNormalTexture()],
      ["emissive", material.getEmissiveTexture()],
      ["occlusion", material.getOcclusionTexture()],
    ];
    for (const [slot, texture] of pbr) if (texture && !slots.has(texture)) slots.set(texture, slot);
  }
  return slots;
}

function countGeometry(root) {
  let tris = 0;
  let verts = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute("POSITION");
      const indices = prim.getIndices();
      verts += position.getCount();
      tris += indices ? indices.getCount() / 3 : position.getCount() / 3;
    }
  }
  return { tris, verts };
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

if (!existsSync(MODELS_DIR)) {
  console.error(`models dir not found: ${MODELS_DIR}`);
  process.exit(1);
}

const files = readdirSync(MODELS_DIR)
  .filter((f) => f.toLowerCase().endsWith(".glb"))
  .sort();

if (files.length === 0) {
  console.log("no .glb files found — nothing to do");
  process.exit(0);
}

let processed = 0;
let skipped = 0;
let failed = 0;
let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
  const modelPath = join(MODELS_DIR, file);
  const backupPath = join(BACKUP_DIR, file);

  // --force re-runs from the pristine backup rather than re-compressing
  // already-compressed art, which would stack generation loss.
  const sourcePath = FORCE && existsSync(backupPath) ? backupPath : modelPath;

  let doc;
  try {
    doc = await io.read(sourcePath);
  } catch (error) {
    console.log(`  ${file.padEnd(14)} FAIL  unreadable: ${error.message}`);
    failed += 1;
    continue;
  }

  const root = doc.getRoot();
  const slots = texturesBySlot(root);

  const alreadyKtx2 = [...slots.keys()].every((t) => t.getMimeType() === "image/ktx2");
  if (alreadyKtx2 && !FORCE) {
    console.log(`  ${file.padEnd(14)} SKIP  already KTX2`);
    skipped += 1;
    continue;
  }

  const beforeBytes = statSync(sourcePath).size;
  const geometryBefore = countGeometry(root);
  const detail = [];

  // ---- emissive first: no point encoding a map that is about to be dropped ----
  for (const material of root.listMaterials()) {
    const texture = material.getEmissiveTexture();
    if (!texture || texture.getMimeType() === "image/ktx2") continue;

    const peak = await peakValue(texture.getImage());
    const before = texture.getImage().byteLength;

    if (peak <= EMISSIVE_BLACK_PEAK) {
      material.setEmissiveTexture(null);
      // CRITICO: em glTF o emissivo e emissiveFactor * emissiveTexture. Remover
      // a textura deixando o fator em [1,1,1] faz a superficie inteira brilhar
      // branco solido. O fator tem de ser zerado junto.
      material.setEmissiveFactor([0, 0, 0]);
      slots.delete(texture);
      detail.push([`emissive`, before, 0, `removido (pico ${peak}/255 = preto)`]);
    } else {
      const target = peak > 32 ? EMISSIVE_SIZE_RICH : EMISSIVE_SIZE;
      const resized = await sharp(texture.getImage()).resize(target, target, { fit: "fill" }).jpeg({ quality: 88 }).toBuffer();
      texture.setImage(new Uint8Array(resized)).setMimeType("image/jpeg");
      detail.push([`emissive`, before, resized.length, `reduzido para ${target}² (pico ${peak})`]);
    }
  }

  // ---- everything else to KTX2 ----
  for (const [texture, slot] of slots) {
    const image = texture.getImage();
    if (!image || texture.getMimeType() === "image/ktx2") continue;

    const before = image.byteLength;
    const meta = await sharp(image).metadata();
    const options = CODEC[slot] ?? CODEC.metallicRoughness;

    const encoded = await encodeToKTX2(image, {
      ...options,
      generateMipmap: true,
      isKTX2File: true,
      imageDecoder,
    });
    texture.setImage(encoded).setMimeType("image/ktx2");
    detail.push([slot, before, encoded.byteLength, `${options.isUASTC ? "UASTC" : "ETC1S"} ${meta.width}×${meta.height}`]);
  }

  doc.createExtension(KHRTextureBasisu).setRequired(true);

  // ---- validate before touching disk ----
  const geometryAfter = countGeometry(root);
  if (geometryBefore.tris !== geometryAfter.tris || geometryBefore.verts !== geometryAfter.verts) {
    console.log(`  ${file.padEnd(14)} FAIL  geometry changed — not written`);
    failed += 1;
    continue;
  }
  const unsafeEmissive = root
    .listMaterials()
    .some((m) => !m.getEmissiveTexture() && Math.max(...m.getEmissiveFactor()) > 0);
  if (unsafeEmissive) {
    console.log(`  ${file.padEnd(14)} FAIL  emissiveFactor non-zero without a texture — not written`);
    failed += 1;
    continue;
  }

  if (DRY) {
    const projected = detail.reduce((sum, [, , after]) => sum + after, 0);
    console.log(`  ${file.padEnd(14)} DRY   ${mb(beforeBytes)} MB → ~${mb(projected)} MB of texture`);
    for (const [slot, before, after, note] of detail) {
      console.log(`      ${slot.padEnd(18)} ${mb(before).padStart(5)} → ${mb(after).padStart(5)} MB   ${note}`);
    }
    processed += 1;
    continue;
  }

  // The pristine original is worth more than any re-derived file: it is the only
  // source a future re-encode can start from without stacking generation loss.
  // Never overwrite one that already exists.
  mkdirSync(BACKUP_DIR, { recursive: true });
  if (!existsSync(backupPath)) copyFileSync(modelPath, backupPath);

  await io.write(modelPath, doc);
  const afterBytes = statSync(modelPath).size;

  totalBefore += beforeBytes;
  totalAfter += afterBytes;
  processed += 1;

  console.log(`  ${file.padEnd(14)} OK    ${mb(beforeBytes)} MB → ${mb(afterBytes)} MB  (-${(100 - (afterBytes / beforeBytes) * 100).toFixed(0)}%)`);
  for (const [slot, before, after, note] of detail) {
    console.log(`      ${slot.padEnd(18)} ${mb(before).padStart(5)} → ${mb(after).padStart(5)} MB   ${note}`);
  }
}

console.log(
  `\ndone: ${processed} processed, ${skipped} already optimized, ${failed} failed` +
    (totalBefore > 0 ? ` — ${mb(totalBefore)} MB → ${mb(totalAfter)} MB` : ""),
);
if (!DRY && processed > 0) {
  console.log("originals backed up to apps/web/.model-backups/ (gitignored)");
}
process.exit(failed > 0 ? 1 : 0);
