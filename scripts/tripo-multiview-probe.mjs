import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { balance, upload, createTask, waitTask, download } from "./lib/tripo.mjs";

/**
 * Prova do gabarito: manda as quatro vistas de argila da malha-mestre
 * (`pnpm exec node scripts/render-master-views.mjs`) cruas para o
 * `multiview-to-model` do Tripo e mede o quanto a malha reconstruída
 * respeita a silhueta da mestre.
 *
 * ## O que está sendo provado
 *
 * O método inteiro de "base + casca" depende de o Tripo devolver um corpo
 * na MESMA pose e proporção do gabarito — é isso que deixa os pesos de skin
 * serem transferidos por proximidade em vez de rigados de novo. Antes de
 * gastar restilização por espécie, esta prova gasta uma geração só (20 a 30
 * créditos) com o gabarito sem arte nenhuma: se nem a argila crua volta na
 * silhueta certa, restilizar por cima não vai ajudar.
 *
 * ## A medida
 *
 * O resultado é renderizado pelas mesmas quatro câmeras do gabarito
 * (`render-master-views.mjs --in <resultado>`), e cada vista é comparada
 * com a da mestre por IoU de silhueta (interseção/união dos pixels não
 * brancos). 1,0 é silhueta idêntica; abaixo de ~0,85 a pose ou a proporção
 * desviaram o bastante para a transferência de pesos puxar o osso errado
 * em membro inteiro.
 *
 *     TRIPO_API_KEY=... node scripts/tripo-multiview-probe.mjs [--views ../mestre/vistas] [--out ../mestre/prova] [--model tripo-v3.1] [--dry]
 *
 * ## Sem API: `--glb <arquivo>`
 *
 * O Tripo Studio (studio.tripo3d.ai) gera o mesmo modelo pela interface a
 * partir das mesmas quatro imagens. Com `--glb`, o script pula upload e
 * geração e só faz a parte local: descreve o arquivo, renderiza as vistas
 * e mede o IoU. É o caminho enquanto a conta da API não tem créditos.
 *
 *     node scripts/tripo-multiview-probe.mjs --glb ../mestre/prova/prova.glb
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const VIEWS_DIR = resolve(repoRoot, arg("views", "../mestre/vistas"));
const OUT_DIR = resolve(repoRoot, arg("out", "../mestre/prova"));
const MODEL = arg("model", "tripo-v3.1");
const DRY = process.argv.includes("--dry");
const GLB_ARG = arg("glb", null);
/** `--aligned`: o GLB já passou pelo `convert-tripo.mjs` (está no espaço da
 * mestre), então as vistas são renderizadas no ENQUADRAMENTO da mestre, e
 * a comparação é membro com membro mesmo quando espinho ou cauda estica a
 * caixa. Sem a flag, cada arquivo é enquadrado pela própria caixa — certo
 * para a prova em argila, errado para uma espécie com apêndices. */
const ALIGNED = process.argv.includes("--aligned");
const MASTER = resolve(repoRoot, arg("master", "../mestre/imp-mestre.glb"));
const VIEW_NAMES = ["front", "left", "back", "right"];

async function silhouetteIoU(a, b) {
  const read = async (p) => {
    const { data, info } = await sharp(p).greyscale().raw().toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height };
  };
  const A = await read(a);
  const B = await read(b);
  if (A.w !== B.w || A.h !== B.h) throw new Error(`tamanhos diferentes: ${a} ${A.w}x${A.h} vs ${b} ${B.w}x${B.h}`);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < A.data.length; i++) {
    const fa = A.data[i] < 250;
    const fb = B.data[i] < 250;
    if (fa && fb) inter++;
    if (fa || fb) union++;
  }
  return union === 0 ? 0 : inter / union;
}

async function describe(glbPath) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(glbPath);
  const root = doc.getRoot();
  let tris = 0;
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute("POSITION");
    tris += (p.getIndices()?.getCount() ?? pos.getCount()) / 3;
    const lo = pos.getMin([]);
    const hi = pos.getMax([]);
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], lo[i]); mx[i] = Math.max(mx[i], hi[i]); }
  }
  return {
    tris: Math.round(tris),
    bbox: mx.map((v, i) => (v - mn[i]).toFixed(2)).join(" × "),
    textures: root.listTextures().map((t) => `${t.getMimeType().replace("image/", "")} ${t.getSize()?.join("x") ?? "?"}`),
    materials: root.listMaterials().map((m) => `${m.getName() || "mat"} met=${m.getMetallicFactor()} rough=${m.getRoughnessFactor()} nrm=${!!m.getNormalTexture()} mr=${!!m.getMetallicRoughnessTexture()}`),
    skins: root.listSkins().length,
    anims: root.listAnimations().length,
    mb: (statSync(glbPath).size / 1e6).toFixed(2),
  };
}

async function main() {
  for (const v of VIEW_NAMES) {
    const p = join(VIEWS_DIR, `${v}.png`);
    if (!existsSync(p)) {
      console.error(`vista ausente: ${p} — rode node scripts/render-master-views.mjs antes`);
      process.exit(1);
    }
  }
  mkdirSync(OUT_DIR, { recursive: true });

  if (GLB_ARG) {
    const glb = resolve(repoRoot, GLB_ARG);
    if (!existsSync(glb)) {
      console.error(`arquivo não encontrado: ${glb}`);
      process.exit(1);
    }
    console.log(`medindo ${glb} (sem API)`);
    await measure(glb);
    return;
  }

  const bal = await balance();
  console.log(`saldo: ${bal.balance} créditos (${bal.frozen} congelados)`);
  if (DRY) {
    console.log(`dry-run: subiria ${VIEW_NAMES.join(", ")} de ${VIEWS_DIR} e pediria multiview-to-model (${MODEL}, pbr, geometry_quality detailed, align_image)`);
    return;
  }
  if (bal.balance < 30) {
    console.error("saldo abaixo de 30 créditos — recarregue antes de rodar a prova");
    process.exit(1);
  }

  console.log("subindo as quatro vistas…");
  const tokens = {};
  for (const v of VIEW_NAMES) {
    tokens[v] = await upload(join(VIEWS_DIR, `${v}.png`));
    console.log(`  ${v.padEnd(6)} ${tokens[v]}`);
  }

  // `orientation: align_image` prende o modelo ao ponto de vista da imagem
  // de frente; `texture_alignment: geometry` prioriza a forma sobre a cor
  // (a argila não tem cor que valha a pena perseguir); `export_orientation`
  // fica no padrão de propósito, como a doc recomenda quando há
  // pós-processamento depois.
  const payload = {
    inputs: VIEW_NAMES.map((v) => ({ [v]: tokens[v] })),
    model: MODEL,
    texture: true,
    pbr: true,
    texture_quality: "standard",
    geometry_quality: "detailed",
    orientation: "align_image",
    texture_alignment: "geometry",
  };
  console.log("criando multiview-to-model…");
  const taskId = await createTask("/generation/multiview-to-model", payload);
  const task = await waitTask(taskId, { label: "multiview" });
  console.log(`créditos consumidos: ${task.credits_consumed}`);

  const out = task.output ?? {};
  const modelUrl = out.model_url ?? out.pbr_model_url ?? out.model;
  if (!modelUrl) {
    console.error("tarefa sem model_url na saída:", JSON.stringify(out));
    process.exit(1);
  }
  const glb = join(OUT_DIR, "prova.glb");
  await download(modelUrl, glb);
  for (const [k, url] of Object.entries(out)) {
    if (k !== "model_url" && typeof url === "string" && url.startsWith("http") && /\.(png|jpe?g|webp)(\?|$)/i.test(url)) {
      await download(url, join(OUT_DIR, `${k}.png`)).catch(() => {});
    }
  }
  console.log(`baixado: ${glb}`);
  await measure(glb);
}

/** Parte local da prova: descreve o GLB, renderiza as vistas e mede o IoU. */
async function measure(glb) {
  const info = await describe(glb);
  console.log(`resultado: ${info.mb} MB, ${info.tris} tris, caixa ${info.bbox} m, skins ${info.skins}, anims ${info.anims}`);
  console.log(`  texturas: ${info.textures.join(", ") || "(nenhuma)"}`);
  console.log(`  materiais: ${info.materials.join("; ")}`);

  // O Tripo não garante a frente em +Z (o export padrão é `+x`), então a
  // malha é medida nas quatro rotações de 90° em Y e vale a melhor. O giro
  // vencedor é informação: é o que o conversor definitivo vai ter de aplicar.
  console.log("renderizando o resultado nas quatro rotações…");
  const results = [];
  for (const yaw of [0, 90, 180, 270]) {
    const dir = join(OUT_DIR, `vistas-yaw${yaw}`);
    const renderArgs = [join(here, "render-master-views.mjs"), "--in", glb, "--out", dir, "--yaw", String(yaw)];
    if (ALIGNED) renderArgs.push("--frame", MASTER);
    execFileSync(process.execPath, renderArgs, { stdio: "pipe" });
    const ious = {};
    let sum = 0;
    for (const v of VIEW_NAMES) {
      ious[v] = await silhouetteIoU(join(VIEWS_DIR, `${v}.png`), join(dir, `${v}.png`));
      sum += ious[v];
    }
    results.push({ yaw, ious, mean: sum / VIEW_NAMES.length });
  }
  results.sort((a, b) => b.mean - a.mean);
  console.log("IoU de silhueta contra a mestre (giro em Y → frente/esquerda/costas/direita → média):");
  for (const r of results) {
    console.log(`  ${String(r.yaw).padStart(3)}°  ${VIEW_NAMES.map((v) => r.ious[v].toFixed(3)).join("  ")}  →  ${r.mean.toFixed(3)}${r === results[0] ? "  ◄ melhor" : ""}`);
  }
  const best = results[0];
  console.log(`\nfrente do resultado: giro de ${best.yaw}° para bater com a mestre (+Z)`);
  console.log(`vistas do melhor giro: ${join(OUT_DIR, `vistas-yaw${best.yaw}`)}`);
  console.log(`veredito: ${best.mean >= 0.85 ? "pose presa ao gabarito" : "silhueta desviou — revisar gabarito ou parâmetros"} (média ${best.mean.toFixed(3)}, limiar 0,85)`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
