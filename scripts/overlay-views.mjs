import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Sobrepõe duas séries de quatro vistas (mestre × casca) numa folha só:
 * cinza onde as silhuetas coincidem, teal onde só a primeira existe, âmbar
 * onde só a segunda. É a leitura visual do IoU de `tripo-multiview-probe.mjs`:
 * o número diz QUANTO desviou, a folha diz ONDE (espinho novo é âmbar
 * esperado; membro fora do lugar é teal e âmbar lado a lado).
 *
 *     node scripts/overlay-views.mjs --a ../mestre/vistas --b <pasta de vistas> --out <arquivo.png>
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const A_DIR = resolve(repoRoot, arg("a", "../mestre/vistas"));
const B_DIR = resolve(repoRoot, arg("b", ""));
const OUT = resolve(repoRoot, arg("out", ""));
const VIEWS = ["front", "left", "back", "right"];
const ONLY_A = [15, 127, 139];
const ONLY_B = [217, 150, 42];
const BOTH = [150, 150, 150];

async function main() {
  const tiles = [];
  let sum = 0;
  for (const [i, v] of VIEWS.entries()) {
    const A = await sharp(join(A_DIR, `${v}.png`)).greyscale().raw().toBuffer({ resolveWithObject: true });
    const B = await sharp(join(B_DIR, `${v}.png`)).greyscale().raw().toBuffer({ resolveWithObject: true });
    const w = A.info.width, h = A.info.height;
    const out = Buffer.alloc(w * h * 3);
    let inter = 0, uni = 0, onlyA = 0, onlyB = 0;
    for (let p = 0; p < w * h; p++) {
      const a = A.data[p] < 250, b = B.data[p] < 250;
      let c;
      if (a && b) { c = BOTH; inter++; uni++; } else if (a) { c = ONLY_A; onlyA++; uni++; } else if (b) { c = ONLY_B; onlyB++; uni++; } else c = [255, 255, 255];
      out[p * 3] = c[0]; out[p * 3 + 1] = c[1]; out[p * 3 + 2] = c[2];
    }
    const iou = uni ? inter / uni : 0;
    sum += iou;
    console.log(`${v.padEnd(6)} IoU ${iou.toFixed(3)}  só A ${(onlyA / uni * 100).toFixed(1)}%  só B ${(onlyB / uni * 100).toFixed(1)}%`);
    tiles.push({ input: await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(), left: i * w, top: 0 });
  }
  console.log(`média ${(sum / VIEWS.length).toFixed(3)}`);
  await sharp({ create: { width: 1024 * 4, height: 1024, channels: 3, background: "#fff" } }).composite(tiles).png().toFile(OUT);
  console.log(`folha: ${OUT} (teal = só A, âmbar = só B, cinza = ambos)`);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
