import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

/**
 * Endireita a POSE DE REPOUSO do esqueleto da mestre, casando-a com a da UAL.
 *
 * ## O problema
 *
 * A mestre é uma casca convertida (`manequim/casca.glb` sobre
 * `puglin-mestre.glb`) e o `convert-tripo.mjs` parte do documento da mestre
 * (`const out = master`) trocando só a malha — então o ESQUELETO do Puglin foi
 * copiado verbatim até as 14 espécies. A malha do manequim foi redesenhada
 * ereta em 15/09; a pose de repouso embaixo dela, não. Medido em 19/09
 * (ângulo da coluna no repouso, 0° = vertical, + = para a frente):
 *
 *     Imp (Quaternius)         10,2°   |  spine_03→Head  20,4°
 *     Puglin (Quaternius)      35,1°   |                 52,2°
 *     manequim-mestre          35,1°   |                 52,2°   ← igual ao Puglin
 *     CRT-001..014             35,1°   |                 52,2°   ← e a todas
 *     UAL1 (manequim dos clipes) 4,8°  |                  2,3°
 *
 * Os clipes da UAL escrevem rotação ABSOLUTA, então a corcunda some assim que
 * um clipe entra: a mestre posada dá 8,8° no `Idle` contra 7,6° da própria UAL.
 * O problema não é a pose animada — é que a malha foi presa (bind) a 35° e o
 * clipe a leva para ~9°. Bind e animação discordam em ~26° na coluna inteira,
 * e a malha paga a diferença: no `Idle`, com o corpo praticamente parado, a
 * cabeça da mestre se desloca 9,9 cm e a do CRT-012 9,2 cm. No Imp, onde malha
 * e esqueleto nasceram juntos, o mesmo `Idle` move a cabeça 0,5 cm.
 *
 * ## O que este script faz
 *
 * Troca a rotação local de repouso de cada osso pela da UAL, MANTENDO a
 * translação (o comprimento de osso é da mestre, e o jogo depende disso — ver
 * `motion_scale` em `creature_actor.gd`). Depois grava as matrizes de bind como
 * a inversa do mundo novo, que é o que mantém a malha exatamente onde está: com
 * `IBM = inverse(World)`, o skinning em repouso vira identidade.
 *
 * Resultado medido na simulação de 19/09, só no `Idle` (corpo parado, então
 * todo deslocamento ali é erro e não animação):
 *
 *                      cabeça desloca   estiramento médio   p95
 *     Imp (alvo)             0,5 cm            3,5%        18,9%
 *     mestre hoje            9,9 cm           11,6%        47,9%
 *     mestre re-posada       5,6 cm            9,9%        38,0%
 *     CRT-012 hoje           9,2 cm           14,4%        55,7%
 *     CRT-012 re-posado      6,4 cm           10,9%        39,0%
 *
 * ~30% nas três métricas, e é PISO: a simulação manteve os pesos velhos. Na
 * ordem certa este script roda ANTES do `repesar-mestre.py`, para o bone heat
 * resolver com a coluna já ereta dentro da malha ereta.
 *
 * O que sobra depois disto: mesmo re-posado, o osso `Head` fica 19 cm abaixo do
 * centro da cabeça da malha. Re-pose corrige a ORIENTAÇÃO da cadeia, não o
 * tamanho nem a posição dos ossos dentro da malha — isso é o botão de
 * cabeça/tronco que o rig adaptativo do `convert-tripo.mjs` ainda não tem.
 *
 *     node scripts/reposar-mestre.mjs --in ../mestre/manequim-mestre.glb \
 *       --out ../mestre/manequim-mestre.reposada.glb \
 *       [--ref apps/web/public/models/characters/animations/UAL1.glb]
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const IN = resolve(repoRoot, arg("in", ""));
const OUT = resolve(repoRoot, arg("out", ""));
const REF = resolve(repoRoot, arg("ref", "apps/web/public/models/characters/animations/UAL1.glb"));
/**
 * Quais ossos re-posar. O padrão é SÓ A COLUNA, e isso foi aprendido caro:
 * re-posar o esqueleto inteiro conserta os números (estiramento no braço caiu
 * de 19,1% para 8,4% no CRT-012) mas ESTRAGA a leitura do braço — no `Idle` o
 * antebraço sobe e encosta na cabeça, e o elenco fica com cara de "mini braço".
 * Visto em 20/09, depois de publicar; o indicador de estiramento não pega isso,
 * porque ele mede deformação, não se a pose lê bem.
 *
 * A corcunda mora na coluna (`spine_03→Head` a 52,2° contra 2,3° da UAL); o
 * braço da mestre já estava em T-pose horizontal, igual ao da UAL, e não tinha
 * o que consertar. `--ossos todos` volta ao comportamento largo, para quem
 * quiser medir de novo.
 */
const SPINE_ONLY = /^(pelvis|spine_0[123]|neck_01|Head)$/;
const SCOPE = arg("ossos", "coluna");

if (!process.argv.includes("--in") || !process.argv.includes("--out")) {
  console.error("uso: node scripts/reposar-mestre.mjs --in <mestre.glb> --out <saida.glb> [--ref <UAL1.glb>]");
  process.exit(1);
}
for (const p of [IN, REF]) if (!existsSync(p)) { console.error(`não encontrado: ${p}`); process.exit(1); }

// --- álgebra (coluna-maior, como o glTF) -----------------------------------

function trs(t, q, s) {
  const [x, y, z, w] = q;
  const m = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    t[0], t[1], t[2], 1,
  ];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] *= s[c];
  return m;
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
/** Inversa geral 4×4 por Gauss-Jordan (mesma do `convert-tripo.mjs`). */
function invert(m) {
  const a = [];
  for (let r = 0; r < 4; r++) { a.push([]); for (let c = 0; c < 4; c++) a[r].push(m[c * 4 + r]); for (let c = 0; c < 4; c++) a[r].push(r === c ? 1 : 0); }
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    if (Math.abs(d) < 1e-12) { console.error("matriz singular ao inverter o repouso"); process.exit(1); }
    for (let k = 0; k < 8; k++) a[c][k] /= d;
    for (let r = 0; r < 4; r++) { if (r === c) continue; const f = a[r][c]; for (let k = 0; k < 8; k++) a[r][k] -= f * a[c][k]; }
  }
  const o = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c * 4 + r] = a[r][c + 4];
  return o;
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  const ref = await io.read(REF);
  const refRot = new Map();
  for (const j of ref.getRoot().listSkins()[0].listJoints()) refRot.set(j.getName(), j.getRotation());

  const doc = await io.read(IN);
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints();
  const parent = new Map();
  for (const j of joints) for (const c of j.listChildren()) parent.set(c, j);
  const world = (j) => {
    const chain = [];
    for (let k = j; k; k = parent.get(k)) chain.unshift(k);
    let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const n of chain) m = mul(m, trs(n.getTranslation(), n.getRotation(), n.getScale()));
    return m;
  };
  const angle = () => {
    const h = world(joints.find((j) => j.getName() === "Head"));
    const p = world(joints.find((j) => j.getName() === "pelvis"));
    return Math.atan2(h[14] - p[14], h[13] - p[13]) * 180 / Math.PI;
  };

  const before = angle();
  let changed = 0;
  const missing = [];
  for (const j of joints) {
    if (SCOPE !== "todos" && !SPINE_ONLY.test(j.getName())) continue;
    const r = refRot.get(j.getName());
    if (!r) { missing.push(j.getName()); continue; }
    if (j.getRotation().some((v, k) => Math.abs(v - r[k]) > 1e-6)) changed++;
    j.setRotation([...r]);
  }
  if (missing.length) console.log(`  ${missing.length} osso(s) sem par na referência, mantidos como estavam: ${missing.join(", ")}`);

  // A malha não se mexe: com IBM = inverse(World), o skinning em repouso é
  // identidade para qualquer peso que some 1.
  const ibm = skin.getInverseBindMatrices();
  ibm.setArray(new Float32Array(joints.map((j) => invert(world(j))).flat()));

  mkdirSync(dirname(OUT), { recursive: true });
  await io.write(OUT, doc);
  console.log(`re-pose: ${changed} de ${joints.length} osso(s) | coluna pelvis→Head ${before.toFixed(1)}° → ${angle().toFixed(1)}° (UAL: 4,8°)`);
  console.log(`escrito: ${OUT}`);
  console.log("próximo passo: repesar no Blender, e só então republicar o elenco (os pesos vêm da mestre por proximidade)");
}

main().catch((err) => { console.error(err); process.exit(1); });
