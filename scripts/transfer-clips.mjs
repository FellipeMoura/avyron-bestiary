import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { stripRootMotion } from "./lib/root-motion.mjs";

/**
 * Transplanta clipes de animação de um corpo Meshy AI para outro, por retarget
 * relativo ao repouso.
 *
 * ## Por que existe
 *
 * O Meshy auto-riga todo bípede no MESMO esqueleto de 24 ossos (mesmos nomes,
 * mesma hierarquia, raiz `Hips`) — mas cada modelo é exportado com o conjunto
 * de clipes que quem exportou escolheu na hora, e a maior parte do elenco do
 * PZ-01 chegou só com `Walk`/`Run`. Reexportar cada um no Meshy custa crédito
 * e tempo; os clipes que faltam já existem em outro corpo do mesmo rig.
 *
 * ## Por que não copiar cru
 *
 * A hierarquia é igual, mas a ROTAÇÃO DE REPOUSO de cada osso não é: o
 * auto-rig ajusta o esqueleto às proporções de cada malha, e a pose de bind
 * de um `Spine02` pode diferir 146° entre dois modelos. Um quadro-chave é
 * rotação local ABSOLUTA (substitui o repouso), então copiado cru ele impõe o
 * repouso do doador ao receptor — medido: desvio médio de 9° a 33° por osso
 * contra o clipe que o receptor teria recebido do Meshy, com ossos virados
 * até 150°.
 *
 * ## O retarget
 *
 * O que se transfere é o DESVIO do repouso, no espaço do osso-pai:
 *
 *     q_receptor(t) = rest_receptor · rest_doador⁻¹ · q_doador(t)
 *
 * Validado empiricamente antes de existir: `Walk` e `Run` estão nos dois
 * lados de todo par doador/receptor do elenco, então dá para retargetar o do
 * doador e comparar com o que o receptor JÁ tem — desvio médio de 3° a 4° por
 * osso, máximo de 12° a 19°, contra a ordem inversa (desvio no espaço do
 * filho), que estourava 50° em três corpos. `--verify` refaz exatamente essa
 * medida no par que você está prestes a gravar, e é por isso que os clipes
 * que o receptor já tem NUNCA são substituídos por padrão: eles são o
 * gabarito.
 *
 * Translação: o `Hips` carrega o corpo (altura, o balanço da braçada); vai
 * escalado pela razão entre as alturas de repouso do quadril dos dois rigs.
 * Os outros 23 ossos têm translação constante (comprimento do osso) — vai o
 * repouso do RECEPTOR, quadro a quadro, para o esqueleto dele não ganhar as
 * proporções do doador. Escala vai copiada (é 1 em todo clipe do Meshy).
 *
 * ## Onde entra no pipeline
 *
 * Roda sobre `.glb` JÁ otimizados (`pnpm models:optimize`) e grava no lugar:
 * o gltf-transform preserva `KHR_texture_basisu` no round-trip (medido: mesmo
 * tamanho em bytes). Antes de gravar, o arquivo original vai para
 * `apps/web/.model-backups/pre-transfer/` (gitignored) se ainda não estiver
 * lá — o `.model-backups/` de `optimize-models.mjs` guarda o cru pré-KTX2, e
 * não cobre todo o elenco. Depois: `pnpm game:export` espelha no jogo.
 *
 *     node scripts/transfer-clips.mjs --from apps/web/public/models/CRT-005.glb \
 *         --to apps/web/public/models/CRT-001.glb [--to ...] [--clips Swim,Swim_Idle] [--verify] [--dry-run]
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const BACKUP_DIR = resolve(repoRoot, "apps/web/.model-backups/pre-transfer");

function parseArgs() {
  const args = process.argv.slice(2);
  const targets = [];
  let source = null;
  let clips = null;
  let verify = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--from") source = args[++i];
    else if (a === "--to") targets.push(args[++i]);
    else if (a === "--clips") clips = args[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--verify") verify = true;
    else if (a === "--dry-run") dryRun = true;
    else {
      console.error(`argumento desconhecido: ${a}`);
      process.exit(1);
    }
  }
  if (!source || targets.length === 0) {
    console.error(
      "uso: node scripts/transfer-clips.mjs --from <doador.glb> --to <receptor.glb> [--to ...] [--clips A,B] [--verify] [--dry-run]",
    );
    process.exit(1);
  }
  return {
    source: resolve(repoRoot, source),
    targets: targets.map((t) => resolve(repoRoot, t)),
    clips,
    verify,
    dryRun,
  };
}

// ---------------------------------------------------------------------------
// quaternions — layout glTF [x, y, z, w], produto de Hamilton a·b
// ---------------------------------------------------------------------------

const qNorm = (q) => {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qAngleDeg = (a, b) => {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
};

// ---------------------------------------------------------------------------
// esqueleto
// ---------------------------------------------------------------------------

/** Ossos do skin por nome, mais o repouso de cada um e quem é a raiz. */
function readSkeleton(doc, label) {
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) {
    console.error(`${label}: sem skin — corpo estático, nada a transplantar`);
    process.exit(1);
  }
  const joints = skin.listJoints();
  const isChild = new Set();
  for (const j of joints) for (const c of j.listChildren()) isChild.add(c);
  const root = joints.find((j) => !isChild.has(j));
  const byName = new Map();
  for (const j of joints) {
    if (byName.has(j.getName())) {
      console.error(`${label}: osso '${j.getName()}' repetido — retarget por nome ficaria ambíguo`);
      process.exit(1);
    }
    byName.set(j.getName(), j);
  }
  return { joints, root, byName };
}

/** Os dois rigs falam a mesma hierarquia? Nome E pai de cada osso. */
function assertSameHierarchy(src, dst, label) {
  const parentName = (skel, j) => {
    const p = j.listParents().find((x) => x.propertyType === "Node");
    return p && skel.byName.has(p.getName()) ? p.getName() : "-";
  };
  const sig = (skel) =>
    skel.joints
      .map((j) => `${parentName(skel, j)}>${j.getName()}`)
      .sort()
      .join("|");
  if (sig(src) !== sig(dst)) {
    console.error(`${label}: esqueleto diferente do doador (nomes/hierarquia) — transplante abortado`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// retarget de um clipe
// ---------------------------------------------------------------------------

/**
 * Copia `anim` (do documento doador) para `dstDoc`, retargetada para `dst`.
 * Devolve a animação nova. Não grava nada.
 */
function retargetClip(anim, src, dst, dstDoc, stats) {
  const buffer = dstDoc.getRoot().listBuffers()[0];
  const out = dstDoc.createAnimation(anim.getName());
  const timesCache = new Map();
  const hipsRatio = dst.root.getTranslation()[1] / src.root.getTranslation()[1];

  for (const channel of anim.listChannels()) {
    const boneName = channel.getTargetNode().getName();
    const target = dst.byName.get(boneName);
    if (!target) {
      stats.skipped.push(`${anim.getName()}:${boneName}`);
      continue;
    }
    const sampler = channel.getSampler();
    const path = channel.getTargetPath();
    const interpolation = sampler.getInterpolation();
    if (interpolation === "CUBICSPLINE") {
      // Três valores por quadro (tangentes); não tratado — mesma postura de
      // `convert-meshy.mjs`. Nunca visto num export do Meshy.
      stats.skipped.push(`${anim.getName()}:${boneName}:${path} (CUBICSPLINE)`);
      continue;
    }
    const values = Array.from(sampler.getOutput().getArray());
    const frames = sampler.getInput().getCount();
    let result;
    let type;

    if (path === "rotation") {
      type = "VEC4";
      const fix = qMul(qNorm(target.getRotation()), qConj(qNorm(src.byName.get(boneName).getRotation())));
      result = new Float32Array(values.length);
      for (let f = 0; f < frames; f += 1) {
        const q = qMul(fix, qNorm(values.slice(f * 4, f * 4 + 4)));
        result.set(q, f * 4);
      }
    } else if (path === "translation") {
      type = "VEC3";
      result = new Float32Array(values.length);
      if (target === dst.root) {
        for (let i = 0; i < values.length; i += 1) result[i] = values[i] * hipsRatio;
      } else {
        const rest = target.getTranslation();
        for (let f = 0; f < frames; f += 1) result.set(rest, f * 3);
      }
    } else if (path === "scale") {
      type = "VEC3";
      result = new Float32Array(values);
      for (const v of values) {
        if (Math.abs(v - 1) > 1e-3) {
          stats.scaled.add(`${anim.getName()}:${boneName}`);
          break;
        }
      }
    } else {
      stats.skipped.push(`${anim.getName()}:${boneName}:${path}`);
      continue;
    }

    const srcInput = sampler.getInput();
    let input = timesCache.get(srcInput);
    if (!input) {
      input = dstDoc
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Float32Array(srcInput.getArray()))
        .setBuffer(buffer);
      timesCache.set(srcInput, input);
    }
    const output = dstDoc.createAccessor().setType(type).setArray(result).setBuffer(buffer);
    const newSampler = dstDoc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(interpolation);
    const newChannel = dstDoc.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(newSampler);
    out.addSampler(newSampler).addChannel(newChannel);
  }
  return out;
}

/**
 * Desfaz um clipe de sondagem por inteiro — canais, samplers E accessors.
 * `Animation.dispose()` sozinho deixaria os accessors órfãos no documento, e
 * o writer os gravaria no buffer: cada `--verify` engordaria o arquivo.
 */
function disposeClip(anim) {
  const accessors = new Set();
  for (const sampler of anim.listSamplers()) {
    accessors.add(sampler.getInput());
    accessors.add(sampler.getOutput());
  }
  for (const channel of anim.listChannels()) channel.dispose();
  for (const sampler of anim.listSamplers()) sampler.dispose();
  for (const accessor of accessors) if (accessor) accessor.dispose();
  anim.dispose();
}

/**
 * Desvio angular entre um clipe retargetado e um clipe que o receptor já tem
 * com o mesmo nome — o gabarito do `--verify`. Amostra até 12 quadros por
 * osso; devolve média e máximo em graus, mais o osso do máximo.
 */
function measureAgainst(retargeted, existing) {
  const byBone = new Map();
  for (const ch of existing.listChannels()) {
    if (ch.getTargetPath() === "rotation") byBone.set(ch.getTargetNode().getName(), ch.getSampler().getOutput().getArray());
  }
  let max = 0;
  let worst = "";
  let sum = 0;
  let n = 0;
  for (const ch of retargeted.listChannels()) {
    if (ch.getTargetPath() !== "rotation") continue;
    const ref = byBone.get(ch.getTargetNode().getName());
    if (!ref) continue;
    const got = ch.getSampler().getOutput().getArray();
    const frames = Math.min(ref.length, got.length) / 4;
    const step = Math.max(1, Math.floor(frames / 12));
    for (let f = 0; f < frames; f += step) {
      const d = qAngleDeg(qNorm(Array.from(got.slice(f * 4, f * 4 + 4))), qNorm(Array.from(ref.slice(f * 4, f * 4 + 4))));
      if (d > max) {
        max = d;
        worst = ch.getTargetNode().getName();
      }
      sum += d;
      n += 1;
    }
  }
  return { mean: n ? sum / n : 0, max, worst };
}

// ---------------------------------------------------------------------------

async function main() {
  const { source, targets, clips, verify, dryRun } = parseArgs();
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  if (!existsSync(source)) {
    console.error(`doador não encontrado: ${source}`);
    process.exit(1);
  }
  const srcDoc = await io.read(source);
  const src = readSkeleton(srcDoc, basename(source));
  const srcClips = new Map(srcDoc.getRoot().listAnimations().map((a) => [a.getName(), a]));
  console.log(`doador: ${basename(source)} — ${[...srcClips.keys()].sort().join(", ")}`);
  if (clips) {
    for (const c of clips) {
      if (!srcClips.has(c)) {
        console.error(`doador não tem o clipe '${c}'`);
        process.exit(1);
      }
    }
  }

  for (const targetPath of targets) {
    const label = basename(targetPath);
    if (!existsSync(targetPath)) {
      console.error(`${label}: não encontrado`);
      process.exit(1);
    }
    const dstDoc = await io.read(targetPath);
    const dst = readSkeleton(dstDoc, label);
    assertSameHierarchy(src, dst, label);
    const existing = new Map(dstDoc.getRoot().listAnimations().map((a) => [a.getName(), a]));
    const hipsRatio = dst.root.getTranslation()[1] / src.root.getTranslation()[1];
    console.log(`\n${label}: já tem ${[...existing.keys()].sort().join(", ") || "(nenhum clipe)"}; quadril ×${hipsRatio.toFixed(3)}`);

    if (verify) {
      // O gabarito: retargeta o que o receptor JÁ tem e mede contra o dele.
      let measured = 0;
      for (const [name, own] of existing) {
        const donor = srcClips.get(name);
        if (!donor) continue;
        const probeStats = { skipped: [], scaled: new Set() };
        const probe = retargetClip(donor, src, dst, dstDoc, probeStats);
        const m = measureAgainst(probe, own);
        console.log(`  verify ${name.padEnd(10)} desvio médio ${m.mean.toFixed(1)}°, máximo ${m.max.toFixed(1)}° (${m.worst})`);
        disposeClip(probe);
        measured += 1;
      }
      if (measured === 0) console.log("  verify: receptor não divide nenhum clipe com o doador — sem gabarito");
    }

    const wanted = (clips ?? [...srcClips.keys()]).filter((name) => {
      if (existing.has(name)) {
        console.log(`  ${name.padEnd(10)} MANTIDO  o receptor já tem o próprio`);
        return false;
      }
      return true;
    });

    const stats = { skipped: [], scaled: new Set() };
    const added = [];
    for (const name of wanted) {
      const clip = retargetClip(srcClips.get(name), src, dst, dstDoc, stats);
      added.push(clip);
      console.log(`  ${name.padEnd(10)} OK       ${clip.listChannels().length} canais`);
    }
    // O doador pode ter sido convertido antes de `convert-meshy.mjs` remover
    // root motion (os corpos de 2026-09-06 chegaram assim), e o transplante
    // herdaria a viagem junto com o gesto. Só nos clipes recém-copiados: os
    // que o receptor já tinha não são deste script.
    for (const s of stripRootMotion(dstDoc, added)) console.log(`  root motion removida: ${s}`);
    for (const s of stats.skipped) console.log(`  AVISO canal pulado: ${s}`);
    for (const s of stats.scaled) console.log(`  AVISO escala ≠ 1 copiada crua em ${s}`);

    if (wanted.length === 0) {
      console.log("  nada a gravar");
      continue;
    }
    if (dryRun) {
      console.log("  --dry-run: não gravado");
      continue;
    }
    mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = join(BACKUP_DIR, label);
    if (!existsSync(backup)) copyFileSync(targetPath, backup);
    await io.write(targetPath, dstDoc);
    const final = dstDoc.getRoot().listAnimations().map((a) => a.getName()).sort();
    console.log(`  gravado: ${final.length} clipes — ${final.join(", ")} (original em ${join("apps/web/.model-backups/pre-transfer", label)})`);
  }

  if (!dryRun) console.log("\npróximo passo: pnpm game:export (espelha os .glb no repo do jogo)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
