import { readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { copyToDocument, createDefaultPropertyResolver, unpartition } from "@gltf-transform/functions";

/**
 * Normaliza o nome dos clipes de um export do Meshy AI pro vocabulário
 * canônico do jogo, no formato que o resto do pipeline já sabe consumir — a
 * mesma forma que `pnpm models:optimize` espera em `apps/web/public/models/`
 * e que `CreatureActor._find_animation_player` já lê sem retarget nenhum.
 *
 * ## Duas formas de export, dois caminhos
 *
 * **Arquivo único (`--source <arquivo>.glb`) é a forma PREFERIDA.** O Meshy
 * libera baixar malha + esqueleto + todos os clipes já num `.glb` só — só
 * precisa renomear os clipes e seguir pro `models:optimize`. Caminho simples,
 * sem fusão de documento nenhuma.
 *
 * **Pasta multi-arquivo (`--source <pasta>/`) é o caminho legado**, usado
 * pelo piloto (`Meshy_AI_Cosmic_Scarabling_biped`) antes de sabermos da opção
 * de arquivo único. O Meshy exporta um `<Nome>_Character_output.glb` (malha +
 * esqueleto, um clipe de bind-pose inútil chamado `clip0`) e um
 * `<Nome>_Animation_<Clipe>_withSkin.glb` por animação — cada um com sua
 * PRÓPRIA cópia da malha/esqueleto inteiros, só pra carregar um clipe. Sem
 * fusão, o jogo veria N corpos diferentes de um clipe só cada, nunca um corpo
 * com N animações. A fusão usa um `resolve` customizado pra
 * `copyToDocument` (`@gltf-transform/functions`): quando a propriedade a
 * copiar é um `Node` cujo NOME já existe no documento-base (o esqueleto é
 * idêntico em nome de nó entre os arquivos — mesma exportação do
 * Blender/Mixamo repetida), devolve o nó do BASE em vez de clonar um novo —
 * as trilhas da animação passam a apontar pro esqueleto que a malha já usa,
 * sem arrastar uma segunda cópia de malha/esqueleto/skin por clipe. Mantido
 * porque o piloto já integrado depende dele; export novo deveria preferir
 * arquivo único.
 *
 * ## Nome de clipe
 *
 * O Meshy exporta o nome real dentro de `Armature|<Clipe>|baselayer`
 * (convenção do Blender ao exportar uma NLA track). `MESHY_CLIP_MAP` mapeia
 * o meio disso pro vocabulário canônico do jogo — mesma ideia do `CLIP_MAP`
 * de `convert-placeholders.mjs`, tabela própria porque o Meshy fala um
 * dialeto diferente (`Punch_Combo`, não `Punch`; `Fall_Dead_from_...`, não
 * `Death`). `Swim_Idle`, `Attack3`, `Harvest` e `Throw` usam o MESMO nome do
 * vocabulário UAL (`character_rig.gd`) de propósito — não são invenção nova,
 * são os nomes que a biblioteca compartilhada de retarget já usa pros mesmos
 * conceitos. `Collect_Object → Harvest` é o que faz o corpo do JOGADOR minerar
 * pelo mesmo nome que `CharacterRig.MINE_CLIP` já pedia quando ele era montado
 * pelo kit de personagens: a troca de corpo (2026-09-07) não mexeu em nenhum
 * chamador porque o vocabulário é o contrato entre os dois lados.
 * Clipe fora do mapa não quebra nada — sai com o nome limpo (sem o invólucro
 * `Armature|...|baselayer`) e o jogo simplesmente nunca o chama por nome, mas
 * ele existe no `AnimationPlayer` pra quem quiser.
 *
 * ## Onde o resultado entra no pipeline
 *
 * Diferente dos placeholders (`models/placeholders/`, N:1, fora do escopo de
 * `models:optimize`), um corpo Meshy é DEFINITIVO — 1:1 com uma criatura — e
 * seguindo exatamente esse contrato: `<CODE>.glb` solto em
 * `apps/web/public/models/`. Essa é a MESMA convenção dos `.glb` estáticos
 * legados do Meshy (ver `CreaturesService.syncModels` e
 * `docs/MODEL_OPTIMIZATION.md`) — o nome do arquivo bate com o `code` da
 * criatura e o `syncModels` liga o `modelUrl` sozinho. Esta função NÃO decide
 * qual criatura recebe qual corpo (isso é decisão de conteúdo, não de
 * conversão de asset) — o chamador passa o caminho de saída já com o código.
 * Depois de gerar o `.glb`: `pnpm models:optimize` (regra do
 * MODEL_OPTIMIZATION.md — nenhum `.glb` do Meshy serve sem passar por ali).
 *
 *     node scripts/convert-meshy.mjs --source ../glb-crt/<arquivo>.glb --out apps/web/public/models/CRT-XXX.glb
 *     node scripts/convert-meshy.mjs --source ../glb-crt/<Pasta>/      --out apps/web/public/models/CRT-XXX.glb
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

/**
 * Meio de `Armature|<Meio>|baselayer` → vocabulário canônico do jogo. Duas
 * chaves por conceito (`running`/`Running`, `walking_man`/`Walking`) porque o
 * Meshy varia a capitalização entre a exportação multi-arquivo do piloto e o
 * `.glb` único que a substituiu — nunca visto os dois ao mesmo tempo no MESMO
 * arquivo, então não é colisão de verdade.
 *
 * `Rising_Flying_Kick → Attack2` é uma correção, não a leitura original: o
 * `.glb` único do CRT-002 chegou sem `Charged_Spell_Cast_1` (removido por
 * engano, junto com um clipe de verdade sem uso — quem exportou confundiu
 * os dois). Sem `Charged_Spell_Cast_1`, o `Attack2` ficaria vago; o
 * `Rising_Flying_Kick`, que antes sobrava sem mapeamento, preenche a vaga.
 */
const MESHY_CLIP_MAP = {
  Idle_02: "Idle",
  Idle_3: "Idle",
  walking_man: "Walk",
  Walking: "Walk",
  running: "Run",
  Running: "Run",
  Run_02: "Run",
  Punch_Combo: "Attack",
  Charged_Spell_Cast_1: "Attack2",
  Rising_Flying_Kick: "Attack2",
  mage_soell_cast_3: "Attack3",
  Hit_Reaction_1: "HitReact",
  Hit_Reaction_to_Waist: "HitReact",
  Fall_Dead_from_Abdominal_Injury: "Death",
  Shot_and_Fall_Backward: "Death",
  Swim_Forward: "Swim",
  Swim_Idle: "Swim_Idle",
  Stand_Dodge: "Dodge",
  Collect_Object: "Harvest",
  baseball_pitching: "Throw",
};

/** Clipe de bind-pose que o `Character_output.glb` sempre traz — descartado,
 * nunca um clipe de verdade (uma pose só, sem trilha útil). Só aparece no
 * caminho multi-arquivo. */
const DISCARD_CLIP_MIDDLE = "clip0";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };
  const source = get("--source");
  const out = get("--out");
  if (!source || !out) {
    console.error(
      "uso: node scripts/convert-meshy.mjs --source <arquivo .glb OU pasta do export Meshy> --out <caminho .glb de saida>",
    );
    process.exit(1);
  }
  return { source: resolve(repoRoot, source), out: resolve(repoRoot, out) };
}

function clipMiddleName(rawName) {
  const parts = rawName.split("|");
  return parts.length >= 2 ? parts[1] : rawName;
}

/**
 * O osso raiz da malha: o joint do skin que não é filho de outro joint.
 * `null` quando o documento não tem skin (corpo estático) — nada a fazer.
 */
function rootJoint(doc) {
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) return null;
  const joints = skin.listJoints();
  const isChild = new Set();
  for (const joint of joints) {
    for (const child of joint.listChildren()) isChild.add(child);
  }
  return joints.find((j) => !isChild.has(j)) ?? null;
}

/**
 * Tira o deslocamento HORIZONTAL líquido do osso raiz de cada clipe.
 *
 * **Todo clipe do jogo é in-place, sem exceção.** Quem move um corpo é sempre
 * o código — `CharacterBody3D` no jogador, a posição do ator nas criaturas —,
 * e um clipe que também anda faz o corpo viajar DUAS vezes: a malha escapa da
 * cápsula de colisão durante o ciclo e volta de um salto quando ele reinicia.
 * As bibliotecas UAL já chegam assim (o comentário de `_build_library` no
 * `character_rig.gd` chama isso de "a versão sem root motion"); o Meshy, não —
 * o `Swim_Forward` do corpo do jogador nada 2,21 m pra frente em 4,57 s, e ele
 * é o único dos sete que anda.
 *
 * Subtrai uma RAMPA LINEAR, não o valor do primeiro quadro: zerar X/Z de vez
 * mataria a ondulação lateral da braçada junto com a viagem. Tirando só a
 * reta que liga o primeiro quadro ao último sobra a oscilação em torno dela —
 * e o ciclo fecha, que é o que um clipe marcado como loop precisa. Y fica
 * intacto: a subida e descida do corpo é gesto, não viagem.
 *
 * CUBICSPLINE sai avisando em vez de ser tratado — o `output` ali guarda três
 * valores por quadro (tangente de entrada, valor, tangente de saída) e mexer
 * nele como se fosse um só produziria uma curva errada em silêncio. Nunca
 * visto num export do Meshy; se aparecer, o aviso é o pedido pra escrever o
 * caso.
 */
function stripRootMotion(doc) {
  const root = rootJoint(doc);
  if (!root) return [];

  const stripped = [];
  for (const anim of doc.getRoot().listAnimations()) {
    for (const channel of anim.listChannels()) {
      if (channel.getTargetNode() !== root || channel.getTargetPath() !== "translation") continue;

      const sampler = channel.getSampler();
      if (sampler.getInterpolation() === "CUBICSPLINE") {
        console.log(`  ${anim.getName().padEnd(40)} AVISO  root motion em CUBICSPLINE, nao tratado`);
        continue;
      }

      const out = sampler.getOutput();
      const values = out.getArray().slice();
      const times = sampler.getInput().getArray();
      const last = values.length / 3 - 1;
      if (last < 1) continue;

      const driftX = values[last * 3] - values[0];
      const driftZ = values[last * 3 + 2] - values[2];

      // Viagem ou oscilação? O corte é RELATIVO à própria excursão horizontal
      // do clipe, não um número em unidades de modelo: o Meshy exporta em
      // centímetros e a UAL em metros, e um limiar absoluto que servisse a um
      // seria cego ou histérico no outro. Um ciclo in-place volta pra perto de
      // onde saiu (deriva perto de zero contra uma excursão inteira); um que
      // viaja acaba na ponta da própria excursão.
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i <= last; i += 1) {
        minX = Math.min(minX, values[i * 3]);
        maxX = Math.max(maxX, values[i * 3]);
        minZ = Math.min(minZ, values[i * 3 + 2]);
        maxZ = Math.max(maxZ, values[i * 3 + 2]);
      }
      const excursion = Math.hypot(maxX - minX, maxZ - minZ);
      const drift = Math.hypot(driftX, driftZ);
      if (excursion === 0 || drift / excursion < 0.25) continue;

      const span = times[times.length - 1] - times[0];
      for (let i = 0; i <= last; i += 1) {
        const ratio = span === 0 ? 0 : (times[i] - times[0]) / span;
        values[i * 3] -= driftX * ratio;
        values[i * 3 + 2] -= driftZ * ratio;
      }
      // Accessor próprio antes de escrever: um `output` compartilhado por dois
      // clipes veria a correção do primeiro aplicada ao segundo.
      channel.getSampler().setOutput(out.clone().setArray(values));
      stripped.push(`${anim.getName()} (${drift.toFixed(2)}u de ${excursion.toFixed(2)}u de excursao)`);
    }
  }
  return stripped;
}

/** Renomeia as animações de `doc` in-place, checando colisão. Compartilhado
 * pelos dois caminhos (arquivo único e fusão multi-arquivo). */
function renameClip(anim, seenCanonical, fileLabel) {
  const midName = clipMiddleName(anim.getName());
  const canonical = MESHY_CLIP_MAP[midName] ?? midName;

  if (MESHY_CLIP_MAP[midName] && seenCanonical.has(canonical)) {
    console.error(
      `  ${fileLabel.padEnd(40)} FALHA  colisao: ${seenCanonical.get(canonical)} e ${midName} mapeiam pra ${canonical}`,
    );
    process.exit(1);
  }
  seenCanonical.set(canonical, midName);
  anim.setName(canonical);

  const status = MESHY_CLIP_MAP[midName] ? "OK   " : "EXTRA";
  console.log(`  ${fileLabel.padEnd(40)} ${status} ${midName} -> ${canonical}`);
  return { canonical, mapped: Boolean(MESHY_CLIP_MAP[midName]) };
}

/** Caminho simples: um `.glb` só, já com malha + esqueleto + todos os
 * clipes. Só renomeia — sem fusão de documento nenhuma. */
async function convertSingleFile(io, source, out) {
  console.log(`arquivo unico: ${source}`);
  const doc = await io.read(source);
  const anims = doc.getRoot().listAnimations();
  if (anims.length === 0) {
    console.error(`nenhuma animacao em ${source}`);
    process.exit(1);
  }

  const seenCanonical = new Map();
  const mergedClips = [];
  const extraClips = [];
  for (const anim of anims) {
    const mid = clipMiddleName(anim.getName());
    if (mid === DISCARD_CLIP_MIDDLE) {
      anim.dispose();
      continue;
    }
    const { canonical, mapped } = renameClip(anim, seenCanonical, anim.getName());
    (mapped ? mergedClips : extraClips).push(canonical);
  }

  const stripped = stripRootMotion(doc);
  await doc.transform(unpartition());
  mkdirSync(dirname(out), { recursive: true });
  await io.write(out, doc);
  return {
    mergedClips,
    extraClips,
    stripped,
    finalAnims: doc.getRoot().listAnimations().map((a) => a.getName()),
  };
}

/** Caminho legado: pasta com `<Nome>_Character_output.glb` (base) e um
 * `<Nome>_Animation_<Clipe>_withSkin.glb` por clipe — funde tudo no base. */
async function convertMultiFile(io, source, out) {
  const files = readdirSync(source).filter((f) => f.toLowerCase().endsWith(".glb"));
  const basePath = files.find((f) => /_Character_output\.glb$/i.test(f));
  const clipPaths = files.filter((f) => /_Animation_.+_withSkin\.glb$/i.test(f));

  if (!basePath) {
    console.error(`nenhum *_Character_output.glb em ${source} — precisa da malha/esqueleto base`);
    process.exit(1);
  }
  if (clipPaths.length === 0) {
    console.error(`nenhum *_Animation_*_withSkin.glb em ${source} — nada para fundir`);
    process.exit(1);
  }

  console.log(`base: ${basePath}`);
  const baseDoc = await io.read(join(source, basePath));
  const baseRoot = baseDoc.getRoot();

  for (const anim of baseRoot.listAnimations()) {
    if (clipMiddleName(anim.getName()) === DISCARD_CLIP_MIDDLE) anim.dispose();
  }

  const targetNodesByName = new Map();
  for (const node of baseRoot.listNodes()) {
    targetNodesByName.set(node.getName(), node);
  }

  const seenCanonical = new Map();
  const mergedClips = [];
  const extraClips = [];

  for (const file of clipPaths.sort()) {
    const path = join(source, file);
    const doc = await io.read(path);
    const anims = doc.getRoot().listAnimations();
    if (anims.length === 0) {
      console.log(`  ${file.padEnd(70)} SKIP  sem animacao`);
      continue;
    }
    if (anims.length > 1) {
      console.log(`  ${file.padEnd(70)} AVISO  ${anims.length} clipes, usando so o primeiro`);
    }
    const anim = anims[0];
    const { canonical, mapped } = renameClip(anim, seenCanonical, file);

    const defaultResolve = createDefaultPropertyResolver(baseDoc, doc);
    const resolve = (prop) => {
      if (prop instanceof Node) {
        const existing = targetNodesByName.get(prop.getName());
        if (existing) return existing;
      }
      return defaultResolve(prop);
    };
    copyToDocument(baseDoc, doc, [anim], resolve);
    (mapped ? mergedClips : extraClips).push(canonical);
  }

  // `copyToDocument` clona um Buffer por documento de origem junto com os
  // accessors da animação (cada arquivo Meshy embute o próprio binário) — um
  // `.glb` só aceita UM buffer, então funde todos num só antes de escrever.
  const stripped = stripRootMotion(baseDoc);
  await baseDoc.transform(unpartition());

  mkdirSync(dirname(out), { recursive: true });
  await io.write(out, baseDoc);
  return {
    mergedClips,
    extraClips,
    stripped,
    finalAnims: baseDoc.getRoot().listAnimations().map((a) => a.getName()),
  };
}

async function main() {
  const { source, out } = parseArgs();
  if (!existsSync(source)) {
    console.error(`origem nao encontrada: ${source}`);
    process.exit(1);
  }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const isFile = statSync(source).isFile();
  const result = isFile
    ? await convertSingleFile(io, source, out)
    : await convertMultiFile(io, source, out);

  console.log(`\nescrito: ${out}`);
  console.log(`clipes canonicos: ${result.mergedClips.sort().join(", ") || "(nenhum)"}`);
  console.log(`clipes extras (fora do vocabulario): ${result.extraClips.sort().join(", ") || "(nenhum)"}`);
  console.log(`root motion removida de: ${result.stripped.sort().join(", ") || "(nenhum clipe andava)"}`);
  console.log(`total de clipes no arquivo final: ${result.finalAnims.length} — ${result.finalAnims.sort().join(", ")}`);
  console.log(`\npróximo passo: pnpm models:optimize (nenhum .glb do Meshy serve sem KTX2 — ver docs/MODEL_OPTIMIZATION.md)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
