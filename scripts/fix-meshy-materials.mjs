import { readdirSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { encodeToKTX2 } from "ktx2-encoder";

/**
 * Normaliza o material de um corpo Meshy AI para PBR comum, do jeito que o
 * kit de personagens humanos já chega.
 *
 * ## O defeito
 *
 * O Meshy exporta o material sem `metallicFactor` — e o default do glTF é
 * **1.0, metal puro**. Metal em PBR não tem resposta difusa: a textura de cor
 * vira cor de REFLEXO, e o corpo só mostra o que o ambiente reflete nele. No
 * jogo o fundo é cor sólida escura, sem sky nem reflection probe, então o
 * modelo inteiro lê preto com brilhos — dos dois lados, independente da luz.
 * Medido em 2026-09-08 com o jogador e um NPC do kit (`metallic 0`) lado a
 * lado no PZ-01: o NPC reagia à luz do bioma, o jogador não; com `metallic 0`
 * o jogador passou a ler igual ao NPC (cabelo sombreado, pele quente, roupa
 * na cor própria).
 *
 * Por que o preview do Meshy parece iluminado mesmo assim: o material vem com
 * `emissiveFactor [1,1,1]` apontando a PRÓPRIA textura de cor como emissivo —
 * o viewer mostra a textura "acesa", não iluminada. É esse truque que o
 * `optimize-models.mjs` já perseguia às cegas (a "armadilha do emissivo" do
 * MODEL_OPTIMIZATION.md): ele reduz o emissivo pra 512², mas como o emissivo
 * É a textura de cor, reduzia a cor junto. Removido aqui, o emissivo deixa de
 * existir para o optimize se preocupar.
 *
 * ## O que muda, e o que não
 *
 * - `metallicFactor` → 0, **só quando não há textura metallic/roughness**:
 *   com textura, o fator multiplica o canal dela e foi autorado de propósito.
 * - Emissivo removido **só quando a textura emissiva é a mesma da cor** (o
 *   truque acima). Brilho legítimo, com mapa próprio, fica como está.
 * - `KHR_materials_specular` (`specularColorFactor [2,2,2]`, outro default do
 *   Meshy) removido — o Godot ignora a extensão, e sem ela o arquivo diz a
 *   verdade sobre como é renderizado.
 * - Rugosidade, textura de cor, geometria, esqueleto e clipes: intocados.
 *
 * ## Onde entra no pipeline
 *
 * `convert-meshy.mjs` chama `normalizeMeshyMaterials` em todo corpo novo, então
 * modelo convertido de hoje em diante já nasce certo. Este CLI existe para o
 * elenco que já estava em `apps/web/public/models/` (e o corpo do jogador em
 * `avyron/models/`, via `--dir`, como o `models:optimize`). Roda sobre `.glb`
 * já otimizados e grava no lugar — o gltf-transform preserva
 * `KHR_texture_basisu` no round-trip (mesma garantia que `transfer-clips.mjs`
 * mede). Idempotente: arquivo sem nada a mudar sai como `SKIP`. O original vai
 * para `apps/web/.model-backups/pre-materials/` (gitignored) se ainda não
 * estiver lá. Depois: `pnpm game:export` espelha no jogo, ou rode com
 * `--dir ../avyron/models` para gravar o espelho direto (saída idêntica byte a
 * byte — o gltf-transform é determinístico).
 *
 * ## `--restore-textures`: a textura de cor que o emissivo derrubou
 *
 * Enquanto o emissivo era a textura de cor, o passo "reduz emissivo pra 512²"
 * do `optimize-models.mjs` reduziu a COR de todo o elenco pra 512² antes do
 * KTX2 (medido em 2026-09-08: 512×512 em 14 CRTs e no jogador; o Meshy exporta
 * 2048²). Com esta flag, para cada corpo que tenha o original cru em
 * `apps/web/.model-backups/<arquivo>` (o backup pré-KTX2 que o optimize
 * guarda), a textura de cor do cru é reencodada pra KTX2 — mesmos parâmetros
 * de `CODEC.baseColor` lá — e trocada no arquivo ATUAL. Só a imagem: o cru não
 * tem os clipes transplantados (`transfer-clips.mjs`) nem a normalização
 * daqui, e é o arquivo atual que os carrega. Corpo sem backup cru fica como
 * está e sai marcado — o caminho de volta é re-baixar do Meshy. Idempotente
 * pela dimensão: só troca quando o cru é maior que o atual.
 *
 *     pnpm models:materials                          # apps/web/public/models
 *     pnpm models:materials -- --dir ../avyron/models # jogador + espelhos
 *     pnpm models:materials -- --dry                 # só lista o que mudaria
 *     pnpm models:materials -- --restore-textures    # + recupera a cor 2048² do backup cru
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const BACKUP_DIR = resolve(repoRoot, "apps/web/.model-backups/pre-materials");
const RAW_BACKUP_DIR = resolve(repoRoot, "apps/web/.model-backups");

// Cópia de `CODEC.baseColor` em optimize-models.mjs — os dois têm de andar
// juntos, senão a cor recuperada aqui sai com qualidade diferente da que o
// optimize daria a um corpo novo.
const BASECOLOR_CODEC = { isUASTC: false, qualityLevel: 220, compressionLevel: 4, isPerceptual: true, isSetKTX2SRGBTransferFunc: true };

// Teto da cor recuperada. É o que o Meshy exporta pro elenco e o que o
// optimize sempre codificou; acima disso o `ktx2-encoder` recusa (limite de
// ~12 Mpix — o corpo do jogador veio em 4096², 16,7 Mpix), e 4096² num corpo
// de 3k tris numa câmera ortográfica não compraria nada além de VRAM.
const BASECOLOR_MAX = 2048;

const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

/**
 * Troca a textura de cor de cada material de `doc` pela do material de mesmo
 * índice em `rawDoc`, reencodada pra KTX2, quando a do cru for maior. Devolve
 * as mudanças (vazia = nada a recuperar).
 */
export async function restoreBaseColor(doc, rawDoc, { dry = false } = {}) {
  const changes = [];
  const rawMaterials = rawDoc.getRoot().listMaterials();
  doc.getRoot().listMaterials().forEach((material, i) => {
    const current = material.getBaseColorTexture();
    const raw = rawMaterials[i]?.getBaseColorTexture();
    if (!current || !raw) return;
    const curSize = current.getSize();
    const rawSize = raw.getSize();
    if (!curSize || !rawSize) return;
    const target = Math.min(rawSize[0], BASECOLOR_MAX);
    if (target <= curSize[0]) return;
    changes.push({ material, current, raw, curSize, rawSize, target });
  });

  const lines = [];
  for (const { material, current, raw, curSize, rawSize, target } of changes) {
    if (!dry) {
      let image = raw.getImage();
      if (rawSize[0] > target) {
        image = new Uint8Array(await sharp(image).resize(target, target, { fit: "fill" }).png().toBuffer());
      }
      const encoded = await encodeToKTX2(image, {
        ...BASECOLOR_CODEC,
        generateMipmap: true,
        isKTX2File: true,
        imageDecoder,
      });
      current.setImage(encoded).setMimeType("image/ktx2");
    }
    const from = rawSize[0] > target ? `${rawSize[0]}² reduzido a ${target}²` : `${target}²`;
    lines.push(`${material.getName() || "(sem nome)"}: cor ${curSize[0]}² -> ${from} (do backup cru)`);
  }
  return lines;
}

/**
 * Aplica a normalização no documento, in-place. Devolve a lista de mudanças
 * (vazia = já estava normalizado), para o chamador logar ou decidir se grava.
 */
export function normalizeMeshyMaterials(doc) {
  const changes = [];
  for (const material of doc.getRoot().listMaterials()) {
    const label = material.getName() || "(sem nome)";

    if (material.getMetallicFactor() !== 0 && !material.getMetallicRoughnessTexture()) {
      changes.push(`${label}: metallic ${material.getMetallicFactor()} -> 0`);
      material.setMetallicFactor(0);
    }

    const emissive = material.getEmissiveTexture();
    if (emissive && emissive === material.getBaseColorTexture()) {
      material.setEmissiveTexture(null);
      // Em glTF o emissivo é fator × textura; fator [1,1,1] sem textura
      // acenderia a superfície inteira em branco (mesma armadilha que o
      // optimize-models.mjs documenta).
      material.setEmissiveFactor([0, 0, 0]);
      changes.push(`${label}: emissivo era a propria textura de cor -> removido`);
    }

    if (material.getExtension("KHR_materials_specular")) {
      material.setExtension("KHR_materials_specular", null);
      changes.push(`${label}: KHR_materials_specular removido`);
    }
  }

  // Extensão sem propriedade restante sairia listada em `extensionsUsed` à
  // toa; descartá-la deixa o arquivo consistente com o que ele contém.
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === "KHR_materials_specular" && ext.listProperties().length === 0) {
      ext.dispose();
    }
  }
  return changes;
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

async function main() {
  const DRY = process.argv.includes("--dry");
  const RESTORE = process.argv.includes("--restore-textures");
  const dirFlag = process.argv.indexOf("--dir");
  const modelsDir = dirFlag === -1
    ? resolve(repoRoot, "apps/web/public/models")
    : resolve(repoRoot, process.argv[dirFlag + 1] ?? "");

  if (!existsSync(modelsDir)) {
    console.error(`pasta de modelos nao encontrada: ${modelsDir}`);
    process.exit(1);
  }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const files = readdirSync(modelsDir)
    .filter((f) => f.toLowerCase().endsWith(".glb"))
    .sort();

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const modelPath = join(modelsDir, file);
    let doc;
    try {
      doc = await io.read(modelPath);
    } catch (error) {
      console.log(`  ${file.padEnd(14)} FAIL  ilegivel: ${error.message}`);
      failed += 1;
      continue;
    }

    const before = countGeometry(doc.getRoot());
    const changes = normalizeMeshyMaterials(doc);

    let noRaw = "";
    if (RESTORE) {
      const rawPath = join(RAW_BACKUP_DIR, file);
      if (existsSync(rawPath)) {
        changes.push(...(await restoreBaseColor(doc, await io.read(rawPath), { dry: DRY })));
      } else {
        noRaw = " (sem backup cru — cor fica como esta)";
      }
    }

    if (changes.length === 0) {
      console.log(`  ${file.padEnd(14)} SKIP  ja normalizado${noRaw}`);
      skipped += 1;
      continue;
    }

    const after = countGeometry(doc.getRoot());
    if (before.tris !== after.tris || before.verts !== after.verts) {
      console.log(`  ${file.padEnd(14)} FAIL  geometria mudou — nao gravado`);
      failed += 1;
      continue;
    }

    if (DRY) {
      console.log(`  ${file.padEnd(14)} DRY   ${changes.join("; ")}`);
      processed += 1;
      continue;
    }

    mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = join(BACKUP_DIR, file);
    if (!existsSync(backupPath)) copyFileSync(modelPath, backupPath);

    await io.write(modelPath, doc);
    console.log(`  ${file.padEnd(14)} OK    ${changes.join("; ")}${noRaw}`);
    processed += 1;
  }

  console.log(`\nfeito: ${processed} normalizados, ${skipped} ja estavam, ${failed} falharam`);
  if (!DRY && processed > 0) {
    console.log(`originais em ${BACKUP_DIR} (gitignored)`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
