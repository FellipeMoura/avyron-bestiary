import { readdirSync, mkdirSync, copyFileSync, existsSync, statSync, rmSync } from "node:fs";
import { resolve, dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Normalize element (ELE-*) and class (CLS-*) badge art to a shared square
 * canvas with consistent padding, and ship as WebP instead of PNG.
 *
 * Source art is inconsistent per-file (CLS came out portrait ~514x597..515x600
 * from the diamond-point frame, ELE came out square-ish but ranging
 * 477x477..488x488) and nearly full-bleed (CLS ~99-100% of canvas, ELE
 * 88-99%), so a hover ring/glow in CSS would clip. This pads every badge onto
 * an identical CANVAS x CANVAS transparent square, sized so content fills
 * CONTENT_RATIO of the canvas — same recipe for both families, so CLS and ELE
 * badges drop into the same grid without per-type CSS.
 *
 * PNG re-encoded at this canvas size stayed 340-390 KB — sharp's zlib deflate
 * barely touches painterly gradient art with soft shadows. WebP at q90 with
 * full alpha quality lands the same badges at 40-60 KB with no visible
 * difference, so that is the shipped format; the pristine PNG is what gets
 * backed up.
 *
 * Run with `pnpm badges:optimize` after adding/replacing badge art in
 * apps/web/public. Idempotent: a badge is skipped once its .webp exists at
 * CANVAS x CANVAS, so re-running after adding one file only touches that file.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const PUBLIC_DIR = resolve(repoRoot, "apps/web/public");
const BACKUP_DIR = resolve(repoRoot, "apps/web/.badge-backups");

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");

const CANVAS = 512;
const CONTENT_RATIO = 0.92; // leaves ~8% transparent margin for hover ring/glow
const CONTENT = Math.round(CANVAS * CONTENT_RATIO);
const WEBP_QUALITY = 90;

const mb = (n) => (n / 1024).toFixed(1) + " KB";

if (!existsSync(PUBLIC_DIR)) {
  console.error(`public dir not found: ${PUBLIC_DIR}`);
  process.exit(1);
}

const files = readdirSync(PUBLIC_DIR)
  .filter((f) => /^(ELE|CLS)-\d+\.png$/i.test(f))
  .sort();

if (files.length === 0) {
  console.log("no ELE-*/CLS-*.png badges found — nothing to do");
  process.exit(0);
}

let processed = 0;
let skipped = 0;
let failed = 0;
let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
  const code = basename(file, extname(file));
  const pngPath = join(PUBLIC_DIR, file);
  const webpPath = join(PUBLIC_DIR, `${code}.webp`);
  const backupPath = join(BACKUP_DIR, file);

  // --force re-runs from the pristine backup rather than re-compressing
  // already-compressed art, which would stack generation loss.
  const sourcePath = FORCE && existsSync(backupPath) ? backupPath : pngPath;

  if (!existsSync(sourcePath)) {
    console.log(`  ${file.padEnd(14)} SKIP  no source (webp shipped, pristine png removed)`);
    skipped += 1;
    continue;
  }

  if (existsSync(webpPath) && !FORCE) {
    const existingMeta = await sharp(webpPath).metadata();
    if (existingMeta.width === CANVAS && existingMeta.height === CANVAS) {
      console.log(`  ${file.padEnd(14)} SKIP  already shipped as ${CANVAS}x${CANVAS} webp`);
      skipped += 1;
      continue;
    }
  }

  const beforeBytes = statSync(sourcePath).size;

  try {
    // Trim whatever margin the source already has, then re-pad uniformly so
    // every badge — square ELE or portrait CLS — ends up centered at the same
    // content-to-canvas ratio.
    const trimmed = sharp(sourcePath).trim({ threshold: 10 });
    const resized = await trimmed
      .resize(CONTENT, CONTENT, { fit: "inside", withoutEnlargement: false })
      .toBuffer({ resolveWithObject: true });

    const output = await sharp({
      create: {
        width: CANVAS,
        height: CANVAS,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: resized.data,
          gravity: "center",
        },
      ])
      .webp({ quality: WEBP_QUALITY, alphaQuality: 100 })
      .toBuffer();

    if (DRY) {
      console.log(
        `  ${file.padEnd(14)} DRY   → ${code}.webp ${CANVAS}x${CANVAS}   ${mb(beforeBytes)} → ~${mb(output.length)}`,
      );
      processed += 1;
      continue;
    }

    mkdirSync(BACKUP_DIR, { recursive: true });
    if (!existsSync(backupPath)) copyFileSync(pngPath, backupPath);

    await sharp(output).toFile(webpPath);
    if (existsSync(pngPath)) rmSync(pngPath);
    const afterBytes = statSync(webpPath).size;

    totalBefore += beforeBytes;
    totalAfter += afterBytes;
    processed += 1;

    console.log(
      `  ${file.padEnd(14)} OK    → ${code}.webp ${CANVAS}x${CANVAS}   ${mb(beforeBytes)} → ${mb(afterBytes)}  (-${(100 - (afterBytes / beforeBytes) * 100).toFixed(0)}%)`,
    );
  } catch (error) {
    console.log(`  ${file.padEnd(14)} FAIL  ${error.message}`);
    failed += 1;
  }
}

console.log(
  `\ndone: ${processed} processed, ${skipped} already optimized, ${failed} failed` +
    (totalBefore > 0 ? ` — ${mb(totalBefore)} → ${mb(totalAfter)}` : ""),
);
if (!DRY && processed > 0) {
  console.log("originals backed up to apps/web/.badge-backups/ (gitignored)");
}
process.exit(failed > 0 ? 1 : 0);
