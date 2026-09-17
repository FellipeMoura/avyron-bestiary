import { readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

/**
 * Normaliza um `.glb` de criatura antes de servir: teto de resolução de
 * textura, emissivo morto fora, e nada de KTX2.
 *
 * ## O que mudou em 2026-09-17
 *
 * Até aqui este script codificava toda textura para KTX2/Basis — a única
 * mudança que fazia a VRAM cair enquanto o viewer three.js do site
 * renderizava os corpos. O site parou de renderizar em 2026-09, e o único
 * consumidor ficou sendo o Godot, que (a) escurece a cor decodificando
 * ETC1S e (b) comprime PNG/JPEG para VRAM sozinho na importação
 * (`detect_3d/compress_to`). Ou seja: o KTX2 era codificado aqui só para o
 * espelho do jogo decodificá-lo de volta. Saiu, junto com o
 * `ktx2-encoder`, o decoder vendorizado e o passo de "textura PNG para o
 * Godot". O espelho agora é cópia direta do arquivo.
 *
 * ## O que ainda vale a pena fazer aqui
 *
 * - **Teto de resolução** (`MAX_TEXTURE`, 2048²): o Tripo pode entregar
 *   4096² (`texture_quality: extreme`), e um chibi a 10% da altura da tela
 *   não usa nada disso. Redimensionar não muda o tamanho do `.glb` tanto
 *   quanto muda a VRAM — JPEG só comprime em disco, a GPU guarda o mapa
 *   descomprimido.
 * - **Emissivo morto**: mapa emissivo cujo pico não passa de preto é ruído
 *   de compressão sobre uma imagem vazia (herança do Meshy). Sai, e o
 *   `emissiveFactor` vai a zero junto — em glTF o emissivo é fator ×
 *   textura, e tirar a textura deixando o fator em 1 acende o corpo inteiro
 *   em branco. O script se recusa a gravar se encontrar essa combinação.
 * - **Idempotência**: arquivo sem nada a mudar sai como `SKIP`; só o que
 *   muda é gravado, e o original vai para `.model-backups/` se ainda não
 *   houver um lá.
 *
 * Roda com `pnpm models:optimize` (varre `apps/web/public/models/*.glb`) ou
 * `--dir <pasta>` para outra pasta, não recursivo. `--dry` só lista.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const DRY = process.argv.includes("--dry");
/** `--file <nome.glb>`: trata um arquivo só. É como `publish-shell.mjs`
 * chama — o estado dos OUTROS corpos da pasta não pode abortar a publicação
 * de um (foi assim que uma republicação em lote parou no primeiro corpo,
 * com os demais ainda em KTX2). */
const fileFlag = process.argv.indexOf("--file");
const ONLY_FILE = fileFlag === -1 ? null : process.argv[fileFlag + 1];
const dirFlag = process.argv.indexOf("--dir");
const MODELS_DIR = dirFlag === -1
  ? resolve(repoRoot, "apps/web/public/models")
  : resolve(repoRoot, process.argv[dirFlag + 1] ?? "");
const BACKUP_DIR = resolve(repoRoot, "apps/web/.model-backups");

const MAX_TEXTURE = 2048;
/** Pico (0–255) até onde um emissivo é considerado preto. Medido nos corpos
 * Meshy de 2026-09: ruído nunca passou de 17, brilho real começava em 90. */
const EMISSIVE_BLACK_PEAK = 8;

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

function countGeometry(root) {
  let tris = 0, verts = 0;
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const position = prim.getAttribute("POSITION");
    const indices = prim.getIndices();
    verts += position.getCount();
    tris += indices ? indices.getCount() / 3 : position.getCount() / 3;
  }
  return { tris, verts };
}

async function processFile(io, file) {
  const modelPath = join(MODELS_DIR, file);
  const before = statSync(modelPath).size;
  const doc = await io.read(modelPath);
  const root = doc.getRoot();
  const geomBefore = countGeometry(root);
  const changes = [];

  // KTX2 não é mais servido: o Godot escurece a cor ao decodificar. Um
  // arquivo que ainda esteja assim precisa ser republicado da fonte
  // (`pnpm models:publish -- --code <CODE>`), não "convertido de volta".
  if (root.listTextures().some((t) => t.getMimeType() === "image/ktx2")) {
    console.log(`  ${file.padEnd(14)} FAIL  ainda em KTX2 — republique da fonte (models:publish)`);
    return false;
  }

  // emissivo morto
  for (const material of root.listMaterials()) {
    const tex = material.getEmissiveTexture();
    if (!tex) continue;
    const peak = await peakValue(Buffer.from(tex.getImage()));
    if (peak <= EMISSIVE_BLACK_PEAK) {
      material.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]);
      if (tex.listParents().length <= 1) tex.dispose();
      changes.push(`emissivo removido (pico ${peak}/255)`);
    }
  }

  // teto de resolução
  for (const tex of root.listTextures()) {
    const size = tex.getSize();
    if (!size || Math.max(...size) <= MAX_TEXTURE) continue;
    const mime = tex.getMimeType();
    const buf = Buffer.from(tex.getImage());
    let pipeline = sharp(buf).resize(MAX_TEXTURE, MAX_TEXTURE, { fit: "inside" });
    pipeline = mime === "image/jpeg" ? pipeline.jpeg({ quality: 92 }) : pipeline.png();
    tex.setImage(await pipeline.toBuffer());
    changes.push(`${tex.getName() || mime} ${size.join("×")} → ≤${MAX_TEXTURE}²`);
  }

  if (changes.length === 0) {
    console.log(`  ${file.padEnd(14)} SKIP  nada a mudar`);
    return true;
  }

  // validação antes de gravar
  const geomAfter = countGeometry(root);
  if (geomAfter.tris !== geomBefore.tris || geomAfter.verts !== geomBefore.verts) {
    console.log(`  ${file.padEnd(14)} FAIL  geometria mudou — não gravado`);
    return false;
  }
  for (const material of root.listMaterials()) {
    if (!material.getEmissiveTexture() && material.getEmissiveFactor().some((v) => v > 0)) {
      console.log(`  ${file.padEnd(14)} FAIL  emissiveFactor sem textura — não gravado`);
      return false;
    }
  }

  if (DRY) {
    console.log(`  ${file.padEnd(14)} DRY   ${changes.join("; ")}`);
    return true;
  }
  mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = join(BACKUP_DIR, file);
  if (!existsSync(backupPath)) copyFileSync(modelPath, backupPath);
  await io.write(modelPath, doc);
  const after = statSync(modelPath).size;
  console.log(`  ${file.padEnd(14)} OK    ${mb(before)} MB → ${mb(after)} MB  ${changes.join("; ")}`);
  return true;
}

async function main() {
  if (!existsSync(MODELS_DIR)) {
    console.error(`pasta não encontrada: ${MODELS_DIR}`);
    process.exit(1);
  }
  const files = readdirSync(MODELS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".glb"))
    .filter((f) => !ONLY_FILE || f === ONLY_FILE)
    .sort();
  if (files.length === 0) {
    console.log(`nenhum .glb em ${MODELS_DIR}`);
    return;
  }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  let failed = 0;
  for (const file of files) {
    try {
      if (!(await processFile(io, file))) failed++;
    } catch (err) {
      failed++;
      console.log(`  ${file.padEnd(14)} FAIL  ${err.message ?? err}`);
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
