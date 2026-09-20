import { existsSync, mkdirSync, statSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { copyToDocument, prune, unpartition } from "@gltf-transform/functions";

/**
 * Veste uma casca gerada no Tripo com o esqueleto da malha-mestre.
 *
 * ## O que é "base + casca"
 *
 * Todo corpo de criatura passa a dividir a MESMA base: o esqueleto de 55
 * ossos do Imp (`../mestre/imp-mestre.glb`, nomenclatura UE Mannequin, a
 * mesma da UAL) e a pose de repouso dele. A criatura só traz a casca: malha
 * e textura geradas sobre a silhueta da mestre. O arquivo final não carrega
 * clipe nenhum — o jogo já dá a biblioteca UAL inteira em runtime a
 * qualquer corpo com esses nomes de osso (`CreatureActor._build_retargeted_animation`,
 * o caminho que o placeholder Imp sempre usou).
 *
 * ## Como a casca ganha pesos sem rig novo
 *
 * Por proximidade, do mesmo jeito que as roupas do kit de personagens
 * herdam os pesos do corpo. Para cada vértice da casca (já alinhada à
 * mestre em escala e posição), pegam-se os K vértices mais próximos da
 * mestre, misturam-se os pesos deles por inverso da distância, e ficam os 4
 * ossos mais fortes, renormalizados. Um vértice longe de tudo (um espinho,
 * uma cauda) herda o osso mais próximo e anda rígido com ele — é o
 * comportamento certo para apêndice sem osso próprio.
 *
 * Isso só funciona porque a silhueta foi presa ao gabarito
 * (`render-master-views.mjs` + `tripo-multiview-probe.mjs`): articulações
 * no mesmo lugar, o resto é casca. O script mede a distância máxima e média
 * do casamento e AVISA quando um vértice ficou longe demais, porque é o
 * sintoma de silhueta que desviou.
 *
 * ## Alinhamento
 *
 * O Tripo devolve o modelo normalizado (altura ≈ 1 unidade), com a frente
 * em +Z (medido pela prova: giro 0°). A casca é escalada pela razão das
 * alturas, apoiada no chão (y mínimo = 0, como a mestre) e centrada em X/Z
 * na caixa da mestre. `--yaw` gira antes, para o dia em que um export vier
 * de frente para outro eixo.
 *
 * ## Saída
 *
 * Um `.glb` com o esqueleto e a skin da mestre (matrizes de bind incluídas),
 * a malha da casca com JOINTS_0/WEIGHTS_0 novos, o material e as texturas
 * do Tripo, zero animações. Segue para `pnpm models:optimize` como qualquer
 * corpo definitivo (`<CODE>.glb` em `apps/web/public/models/`).
 *
 *     node scripts/convert-tripo.mjs --in ../mestre/prova/prova.glb --out ../mestre/prova/prova-rigada.glb [--master ../mestre/imp-mestre.glb] [--yaw 0] [--k 4] [--exclude-head-beyond 0.18]
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const IN = resolve(repoRoot, arg("in", ""));
const OUT = resolve(repoRoot, arg("out", ""));
const MASTER = resolve(repoRoot, arg("master", "../mestre/imp-mestre.glb"));
const YAW = Number(arg("yaw", "0")) * Math.PI / 180;
const K = Number(arg("k", "4"));
/** Acima disto (em metros) o casamento é suspeito: a casca tem vértice a
 * mais de um palmo de qualquer vértice da mestre. */
const FAR_WARN = 0.12;
/** `--exclude-head-beyond <m>`: ignora, como candidatos à transferência, os
 * vértices da mestre pesados na cabeça (`Head` ≥ 50%) que estejam a mais
 * de X metros do plano central. É o caso das ORELHAS do Puglin: ficam na
 * altura do ombro, com |x| até 0,44 m, e sem este filtro o ombro e o braço
 * da casca herdam o osso da cabeça e viram "abas" quando o braço desce
 * (medido em 2026-09-15: 348 vértices de braço do manequim com Head
 * dominante). A cabeça do Puglin sem orelhas fica em |x| ≤ 0,18 m. */
const EXCLUDE_HEAD_BEYOND = Number(arg("exclude-head-beyond", "0")) || 0;
/**
 * Apêndices rígidos. Um espinho, garra ou cauda é um trecho da casca LONGE
 * da superfície da mestre, e a transferência por proximidade dá a cada
 * vértice dele uma mistura diferente de ossos (medido no CRT-005 em
 * 2026-09-17: 100% dos vértices de espinho com mistura ≥ 15% de 2+ ossos, e
 * uma garra repartida entre cinco ossos do braço). Pesos que variam ao
 * longo do apêndice é o que o rasga e torce quando os ossos se separam.
 * Aqui cada componente conexo de vértices "longe" recebe UM peso só: a
 * média dos pesos da base onde ele encosta no corpo. O apêndice inteiro
 * passa a andar como corpo rígido preso à base — que é o que o auto-rig do
 * Meshy fazia, por pintar pelo osso mais próximo.
 *
 * `APPENDAGE_DIST` é o que conta como "longe" (membro do componente);
 * `APPENDAGE_PROTRUDE` é quanto o componente precisa se afastar no ponto
 * mais distante para ser apêndice de verdade — um trecho de barriga ou de
 * braço mais grosso que a mestre passa de 4 cm sem ser apêndice, e
 * endurecê-lo travaria uma articulação. `--no-rigid-appendages` desliga.
 */
const RIGID_APPENDAGES = !process.argv.includes("--no-rigid-appendages");
const APPENDAGE_DIST = Number(arg("appendage-dist", "0.04"));
const APPENDAGE_PROTRUDE = Number(arg("appendage-protrude", "0.07"));
/** Fora desta faixa o rig adaptativo avisa que encolheu (ou esticou) demais o
 * membro — ver o bloco de AVISO logo abaixo do log do rig. */
const LIMB_WARN_LO = Number(arg("limb-warn-lo", "0.85"));
const LIMB_WARN_HI = Number(arg("limb-warn-hi", "1.15"));
/** Abaixo disto o braço lê atarracado mesmo com o fator perto de 1 — ver o
 * segundo AVISO do rig adaptativo. Referência: mestre 47%, Imp 44%. */
const ARM_RATIO_WARN = Number(arg("arm-ratio-warn", "0.40"));
/**
 * Regiões rígidas declaradas pela espécie — `regioes.json` ao lado da
 * `casca.glb` (ou `--regioes <arquivo>`).
 *
 * POR QUE existe, medido em 2026-09-19 contra o Imp (corpo do kit, rigado à
 * mão) como referência: um rig feito à mão pinta ILHAS — 63% dos vértices do
 * Imp pertencem a UM osso só, e as piores arestas dele esticam 19% e estão
 * nas juntas de verdade (`pelvis|thigh`, `spine_01|spine_02`). A
 * transferência por proximidade, por construção, pinta um GRADIENTE: só 6%
 * dos vértices da mestre têm osso único, e as piores arestas dela esticam
 * 62% — 692 delas DENTRO da cabeça (`Head|Head`), que deveria ser um bloco
 * rígido. A cabeça do CRT-012 sair oval no jogo é isso.
 *
 * Nada de pós-processamento de peso converte gradiente em ilha, e as três
 * tentativas estão registradas para ninguém repetir: podar peso abaixo de um
 * limiar (0,05–0,20) PIORA o corpo inteiro (p95 de 66% para 90%), porque os
 * pesos fracos são a transição das juntas; `--k 1` piora mais (p95 92%); e
 * restringir por distância no grafo do esqueleto zera o vazamento da cabeça
 * para o braço (5,8% → 0,0%) mas troca o vínculo errado por COSTURA, abrindo
 * arestas `Head|upperarm` novas no lugar.
 *
 * O que cria ilha é declarar a ilha. Cada região diz "este trecho é uma peça
 * só, presa NESTE osso": peso 1,0 no núcleo, e uma rampa para dentro da
 * fronteira para a costura não abrir — a mesma rampa do passo de apêndice
 * rígido acima, que já se mediu funcionando (4,5%–6,3% de estiramento nas
 * saliências contra 62% na superfície geral).
 *
 * ## ATENÇÃO: declarar região não substitui peso bom na mestre
 *
 * Medido no CRT-012 em 2026-09-19, declarando `{"osso":"Head","dominante":true}`
 * contra a mestre ANTIGA (a de 15/09, sem repesagem): o NÚCLEO fica
 * perfeitamente rígido (mediana das arestas `Head|Head` vai de 4,7% para 0,0%,
 * que é o alvo), mas o p95 PIORA (67,5% → 88,6%) e o número de arestas esticando
 * mais de 200% dobra (218 → 528), com rasgo visível na fronteira (aresta de
 * 4,4 mm virando 60 mm). O relaxamento abaixo reduz o pior caso (de 4159% para
 * 1248%) sem resolver o p95.
 *
 * A razão é estrutural e vale para qualquer remendo local: a ilha encosta num
 * GRADIENTE, e a transição que ela precisaria não existe em volta dela para ser
 * reconstruída. O passo de apêndice escapa disso porque apêndice é
 * geometricamente separado — a costura cai numa dobra, com espaço para rampa.
 * A cabeça encosta em superfície lisa, e ali toda costura aparece.
 *
 * O conserto foi a MONTANTE, em 19–20/09, em dois passos, e o elenco inteiro foi
 * republicado sobre eles — SEM nenhuma região declarada. Medido nas 14 (p95):
 *
 *                                   cabeça   corpo
 *     antes de tudo                  62,7%   55,9%
 *     só repesada (repesar-mestre.py) 25,7%  55,7%   ← conserta QUEM comanda
 *     + re-posada (reposar-mestre.mjs) 4,8%  33,6%   ← conserta ONDE o osso está
 *     Imp, rigado à mão (alvo)         3,5%  21,2%
 *
 * Repesar sozinho não mexeu no corpo porque o bind estava a 35° e a animação a
 * ~9°: peso perfeito não ajuda se a pose de repouso discorda da animada. Ver
 * `mestre/README.md` para a tabela completa e o que ainda sobra.
 *
 * Portanto: use região para o que a repesagem não resolve sozinha — carapaça,
 * fileira de espinho, qualquer peça que a espécie queira como bloco e cuja
 * fronteira caia numa dobra. Antes de declarar uma, meça: pode não ser preciso.
 *
 * Formato (todas as medidas em FRAÇÃO da altura da casca já alinhada, com
 * y = 0 no chão e x/z medidos a partir do eixo do corpo — as mesmas
 * proporções que se leem na folha 2×2):
 *
 *     {
 *       "rigidas": [
 *         { "nome": "cabeça",   "osso": "Head",     "dominante": true },
 *         { "nome": "carapaça", "osso": "spine_03",
 *           "caixa": { "y": [0.45, 0.75], "z": [-1, -0.05] }, "rampa": 0.04 }
 *       ]
 *     }
 *
 * Duas formas de dizer ONDE, combináveis (vale a mais restritiva):
 *
 * - `"dominante": true` — o trecho que o osso JÁ domina. É a forma certa para
 *   um bloco que o corpo tem mas a geometria não separa: a cabeça do CRT-012 é
 *   uma bola sentada no ombro (braços em 0,52–0,60 da altura, cabeça a partir
 *   de 0,62) e nenhum corte horizontal separa as duas. A transferência acerta
 *   QUAL osso manda; o que ela erra é o gradiente. Aqui a rampa corre sobre o
 *   próprio peso — `de` (padrão 0,55) é onde ainda vale o peso original e `ate`
 *   (padrão 0,90) é onde já é rígido —, então a fronteira fica exatamente onde
 *   a proximidade a colocou e só o miolo endurece.
 * - `"acima": <fração>` ou `"caixa": {x,y,z}` — por geometria, em FRAÇÃO da
 *   altura da casca alinhada (y = 0 no chão, x/z a partir do eixo do corpo:
 *   as mesmas proporções que se leem na folha 2×2). Eixo omitido não
 *   restringe. `rampa` (padrão 0,05) é medida para DENTRO da fronteira.
 */
const RIGID_REGIONS_OFF = process.argv.includes("--no-regions");
const REGIONS_ARG = arg("regioes", null);
const DEFAULT_RAMP = 0.05;
/** Largura (em anéis de malha) e passadas do relaxamento que reconstrói a
 * transição em volta de uma ilha declarada — ver o bloco de relaxamento. */
const REGION_SMOOTH_RINGS = Number(arg("region-smooth-rings", "3"));
const REGION_SMOOTH_PASSES = Number(arg("region-smooth-passes", "4"));

if (!process.argv.includes("--in") || !process.argv.includes("--out")) {
  console.error("uso: node scripts/convert-tripo.mjs --in <casca.glb> --out <saida.glb> [--master <mestre.glb>] [--yaw graus] [--k vizinhos] [--regioes <arquivo.json>] [--no-regions]");
  process.exit(1);
}

/** Lê e valida as regiões declaradas. Devolve [] quando não há arquivo. */
function loadRegions(joints) {
  if (RIGID_REGIONS_OFF) return [];
  const path = REGIONS_ARG ? resolve(repoRoot, REGIONS_ARG) : join(dirname(IN), "regioes.json");
  if (!existsSync(path)) {
    if (REGIONS_ARG) { console.error(`regiões não encontradas: ${path}`); process.exit(1); }
    return [];
  }
  let doc;
  try { doc = JSON.parse(readFileSync(path, "utf8")); }
  catch (err) { console.error(`regiões: JSON inválido em ${path} — ${err.message}`); process.exit(1); }
  const list = Array.isArray(doc?.rigidas) ? doc.rigidas : [];
  const out = [];
  list.forEach((r, i) => {
    const label = r?.nome ?? `#${i + 1}`;
    const bone = joints.findIndex((j) => j.getName() === r?.osso);
    if (bone === -1) {
      console.error(`regiões: "${label}" pede o osso "${r?.osso}", que não existe na mestre`);
      process.exit(1);
    }
    const box = { x: r?.caixa?.x ?? null, y: r?.caixa?.y ?? null, z: r?.caixa?.z ?? null };
    if (typeof r?.acima === "number") box.y = [r.acima, Infinity];
    const byWeight = r?.dominante === true;
    if (!byWeight && !box.x && !box.y && !box.z) {
      console.error(`regiões: "${label}" não delimita nada (use "dominante", "acima" ou "caixa")`);
      process.exit(1);
    }
    const ramp = Number(r?.rampa ?? DEFAULT_RAMP);
    if (!(ramp > 0)) { console.error(`regiões: "${label}" tem rampa ${r?.rampa}; precisa ser > 0`); process.exit(1); }
    const from = Number(r?.de ?? 0.55), to = Number(r?.ate ?? 0.90);
    if (byWeight && !(to > from)) { console.error(`regiões: "${label}" tem de=${from} e ate=${to}; precisa de "ate" > "de"`); process.exit(1); }
    out.push({ label, bone, boneName: r.osso, box, ramp, byWeight, from, to });
  });
  console.log(`regiões rígidas: ${out.length} declarada(s) em ${path}`);
  return out;
}

/**
 * Pertinência de um ponto à região, em [0,1]: 1 no núcleo, descendo a 0 na
 * fronteira ao longo da rampa. É o mínimo entre os eixos restringidos, então
 * o canto de uma caixa rampa nos dois eixos ao mesmo tempo, sem degrau.
 * `p` vem em fração da altura; eixo com limite infinito não rampa daquele lado.
 */
function regionMembership(p, boneWeight, region) {
  let t = 1;
  if (region.byWeight) {
    t = clamp((boneWeight - region.from) / (region.to - region.from), 0, 1);
    if (t <= 0) return 0;
  }
  for (const [axis, k] of [["x", 0], ["y", 1], ["z", 2]]) {
    const span = region.box[axis];
    if (!span) continue;
    const [lo, hi] = span;
    const dLo = Number.isFinite(lo) ? (p[k] - lo) / region.ramp : Infinity;
    const dHi = Number.isFinite(hi) ? (hi - p[k]) / region.ramp : Infinity;
    t = Math.min(t, clamp(Math.min(dLo, dHi), 0, 1));
    if (t <= 0) return 0;
  }
  return t;
}

// --- geometria -------------------------------------------------------------

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function worldMatrix(node) {
  const p = node.getParentNode();
  return p ? mul(worldMatrix(p), node.getMatrix()) : node.getMatrix();
}
function applyPoint(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}
function applyDir(m, v) {
  const o = [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
  const l = Math.hypot(...o) || 1;
  return o.map((x) => x / l);
}
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
/** Inversa geral de 4×4 (coluna-maior), por Gauss-Jordan. */
function invert(m) {
  const a = [];
  for (let r = 0; r < 4; r++) { a.push([]); for (let c = 0; c < 4; c++) a[r].push(m[c * 4 + r]); for (let c = 0; c < 4; c++) a[r].push(r === c ? 1 : 0); }
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    for (let k = 0; k < 8; k++) a[c][k] /= d;
    for (let r = 0; r < 4; r++) if (r !== c) { const f = a[r][c]; for (let k = 0; k < 8; k++) a[r][k] -= f * a[c][k]; }
  }
  const o = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c * 4 + r] = a[r][4 + c];
  return o;
}
function percentile(arr, q) {
  const s = [...arr].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] : NaN;
}

function bounds(points) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
  return { mn, mx };
}

/** Grade uniforme para busca de vizinhos: 7 mil × 6,5 mil pares caberiam em
 * força bruta, mas a grade mantém o script instantâneo quando a casca
 * crescer para 30 mil vértices. */
class Grid {
  constructor(points, cell) {
    this.points = points;
    this.cell = cell;
    this.map = new Map();
    points.forEach((p, i) => {
      const k = this.key(p);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(i);
    });
  }
  key(p) {
    return `${Math.floor(p[0] / this.cell)},${Math.floor(p[1] / this.cell)},${Math.floor(p[2] / this.cell)}`;
  }
  nearest(p, k) {
    const cx = Math.floor(p[0] / this.cell), cy = Math.floor(p[1] / this.cell), cz = Math.floor(p[2] / this.cell);
    for (let radius = 1; radius <= 64; radius++) {
      const found = [];
      for (let x = cx - radius; x <= cx + radius; x++) for (let y = cy - radius; y <= cy + radius; y++) for (let z = cz - radius; z <= cz + radius; z++) {
        const bucket = this.map.get(`${x},${y},${z}`);
        if (!bucket) continue;
        for (const i of bucket) {
          const q = this.points[i];
          found.push({ i, d: Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) });
        }
      }
      // Só aceita quando os k melhores estão garantidamente dentro do raio
      // já varrido (qualquer célula fora está a ≥ (radius-1)·cell de p).
      if (found.length >= k) {
        found.sort((a, b) => a.d - b.d);
        if (found[k - 1].d <= (radius - 1) * this.cell || radius === 64) return found.slice(0, k);
      }
    }
    throw new Error("vizinho não encontrado");
  }
}

// --- leitura ---------------------------------------------------------------

async function main() {
  for (const p of [IN, MASTER]) if (!existsSync(p)) { console.error(`não encontrado: ${p}`); process.exit(1); }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  // Mestre: esqueleto, skin, malha pesada.
  const master = await io.read(MASTER);
  const mRoot = master.getRoot();
  const skin = mRoot.listSkins()[0];
  const joints = skin.listJoints();
  const mMeshNode = mRoot.listNodes().find((n) => n.getMesh() && n.getSkin());
  const mPrim = mMeshNode.getMesh().listPrimitives()[0];
  const mPos = mPrim.getAttribute("POSITION");
  const mJ = mPrim.getAttribute("JOINTS_0");
  const mW = mPrim.getAttribute("WEIGHTS_0");
  const headIndex = joints.findIndex((j) => j.getName() === "Head");
  let mPoints = [];
  const mIndex = []; // índice original na primitiva da mestre, por candidato
  let excluded = 0;
  for (let i = 0; i < mPos.getCount(); i++) {
    const p = mPos.getElement(i, []);
    if (EXCLUDE_HEAD_BEYOND > 0 && headIndex !== -1 && Math.abs(p[0]) > EXCLUDE_HEAD_BEYOND) {
      const jj = mJ.getElement(i, []), wv = mW.getElement(i, []);
      let hw = 0;
      for (let t = 0; t < 4; t++) if (jj[t] === headIndex) hw += wv[t];
      if (hw >= 0.5) { excluded++; continue; }
    }
    mPoints.push(p);
    mIndex.push(i);
  }
  if (excluded > 0) console.log(`mestre: ${excluded} vértice(s) de cabeça além de ${EXCLUDE_HEAD_BEYOND} m ignorados como candidatos (orelhas)`);
  const mBox = bounds(mPoints);
  const mHeight = mBox.mx[1] - mBox.mn[1];
  console.log(`mestre: ${mPoints.length} vértices, ${joints.length} ossos, altura ${mHeight.toFixed(3)} m`);

  // Casca: junta todas as primitivas em espaço de mundo do arquivo do Tripo.
  const shell = await io.read(IN);
  const sRoot = shell.getRoot();
  const parts = [];
  for (const node of sRoot.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const wm = worldMatrix(node);
    for (const prim of mesh.listPrimitives()) parts.push({ prim, wm });
  }
  if (parts.length === 0) { console.error("a casca não tem malha"); process.exit(1); }

  const c = Math.cos(YAW), s = Math.sin(YAW);
  const yaw = (p) => [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
  const raw = parts.map(({ prim, wm }) => {
    const pos = prim.getAttribute("POSITION");
    const nrm = prim.getAttribute("NORMAL");
    const pts = [], nms = [];
    for (let i = 0; i < pos.getCount(); i++) {
      pts.push(yaw(applyPoint(wm, pos.getElement(i, []))));
      nms.push(nrm ? yaw(applyDir(wm, nrm.getElement(i, []))) : [0, 1, 0]);
    }
    return { prim, pts, nms };
  });
  const allPts = raw.flatMap((r) => r.pts);
  const sBox = bounds(allPts);
  let grid = new Grid(mPoints, 0.05);

  // Alinhamento em duas etapas. A caixa da casca NÃO serve de referência
  // final: espinho na cabeça ou cauda estica a caixa e encolheria o corpo
  // inteiro, tirando joelho e cotovelo do lugar (foi o que aconteceu na
  // primeira Hallucigenia: caixa 1,00 de altura com espinhos, corpo real
  // menor que a mestre). Então:
  //
  // 1. chute inicial pela ENVERGADURA (extensão em X): a T-pose é a parte
  //    mais protegida da silhueta pelo gabarito, e apêndice raramente
  //    passa da ponta dos dedos; pés no chão, centro X/Z pela caixa;
  // 2. refino por mínimos quadrados APARADOS: a cada iteração, casa cada
  //    vértice da casca com o vértice mais próximo da mestre, fica só com
  //    os 70% de casamento mais curto (os apêndices caem fora sozinhos) e
  //    resolve escala uniforme + translação que minimizam a distância.
  //    Sem rotação: a frente já vem de `--yaw`.
  let scale = (mBox.mx[0] - mBox.mn[0]) / (sBox.mx[0] - sBox.mn[0]);
  let offset = [
    (mBox.mn[0] + mBox.mx[0]) / 2 - ((sBox.mn[0] + sBox.mx[0]) / 2) * scale,
    mBox.mn[1] - sBox.mn[1] * scale,
    (mBox.mn[2] + mBox.mx[2]) / 2 - ((sBox.mn[2] + sBox.mx[2]) / 2) * scale,
  ];
  const applyAlign = (p) => [p[0] * scale + offset[0], p[1] * scale + offset[1], p[2] * scale + offset[2]];
  const KEEP = 0.7;
  let meanBefore = null;
  for (let iter = 0; iter < 12; iter++) {
    const pairs = allPts.map((p) => { const a = applyAlign(p); const nb = grid.nearest(a, 1)[0]; return { p, q: mPoints[nb.i], d: nb.d }; });
    pairs.sort((x, y) => x.d - y.d);
    const kept = pairs.slice(0, Math.floor(pairs.length * KEEP));
    const meanAll = pairs.reduce((s, x) => s + x.d, 0) / pairs.length;
    if (meanBefore === null) meanBefore = meanAll;
    // Similaridade (escala uniforme + translação) por mínimos quadrados.
    const n = kept.length;
    const pm = [0, 0, 0], qm = [0, 0, 0];
    for (const { p, q } of kept) for (let i = 0; i < 3; i++) { pm[i] += p[i] / n; qm[i] += q[i] / n; }
    let num = 0, den = 0;
    for (const { p, q } of kept) for (let i = 0; i < 3; i++) { num += (p[i] - pm[i]) * (q[i] - qm[i]); den += (p[i] - pm[i]) ** 2; }
    const s2 = num / den;
    const off2 = [0, 1, 2].map((i) => qm[i] - s2 * pm[i]);
    const delta = Math.abs(s2 - scale) + Math.hypot(...off2.map((v, i) => v - offset[i]));
    scale = s2; offset = off2;
    if (delta < 1e-5) break;
  }
  const align = applyAlign;
  const meanAfter = allPts.reduce((s, p) => s + grid.nearest(align(p), 1)[0].d, 0) / allPts.length;
  console.log(`casca: ${allPts.length} vértices em ${parts.length} primitiva(s), caixa ${(sBox.mx[0] - sBox.mn[0]).toFixed(2)} × ${(sBox.mx[1] - sBox.mn[1]).toFixed(2)} × ${(sBox.mx[2] - sBox.mn[2]).toFixed(2)}, giro ${(YAW * 180 / Math.PI).toFixed(0)}°`);
  console.log(`alinhamento: escala ×${scale.toFixed(3)}, deslocamento (${offset.map((v) => v.toFixed(3)).join(", ")}) m — distância média à mestre ${(meanBefore * 100).toFixed(1)} cm → ${(meanAfter * 100).toFixed(1)} cm após o refino`);

  // --- rig adaptativo -----------------------------------------------------
  // O gerador de imagem não reproduz as proporções da mestre à risca: braço e
  // perna saem 10–20% mais curtos com frequência (medido na Hallucigenia,
  // 2026-09-16). Em vez de brigar com o gerador, o esqueleto se adapta à
  // casca: mede-se a envergadura e a altura do chão da casca já alinhada,
  // escalam-se os ossos do braço (lowerarm, hand, dedos) e da perna (calf,
  // foot, ball) mais a altura do quadril (pelvis), recomputam-se as matrizes
  // de bind e a malha da mestre é reposta por skinning nos ossos novos, para
  // a transferência por proximidade casar membro com membro. O jogo aceita
  // comprimento de osso por corpo (a UAL só escreve rotações; `motion_scale`
  // lê a altura do quadril de cada esqueleto), então a proporção final é a
  // da arte, não a da mestre. `--no-adapt` desliga.
  const ADAPT = !process.argv.includes("--no-adapt");
  if (ADAPT) {
    const jname = (n) => joints.findIndex((j) => j.getName() === n);
    const jw0 = joints.map((j) => worldMatrix(j));
    const posOf = (i) => [jw0[i][12], jw0[i][13], jw0[i][14]];
    const shoulder = posOf(jname("upperarm_l"));
    const hipY = posOf(jname("thigh_l"))[1];
    const aligned = allPts.map(align);
    const armBand = (pts) => pts.filter((p) => Math.abs(p[1] - shoulder[1]) < 0.06).map((p) => Math.abs(p[0]));
    const mTip = percentile(armBand(mPoints), 0.995);
    const sTip = percentile(armBand(aligned), 0.995);
    const fArm = clamp((sTip - Math.abs(shoulder[0])) / (mTip - Math.abs(shoulder[0])), 0.6, 1.4);
    const mFloor = percentile(mPoints.map((p) => p[1]), 0.005);
    const sFloor = percentile(aligned.map((p) => p[1]), 0.005);
    const fLeg = clamp((hipY - sFloor) / (hipY - mFloor), 0.6, 1.4);

    const scaleBone = (name, f) => {
      const i = jname(name);
      if (i === -1) return;
      joints[i].setTranslation(joints[i].getTranslation().map((v) => v * f));
    };
    for (const side of ["l", "r"]) {
      for (const b of ["lowerarm", "hand", "index_01", "middle_01", "ring_01", "pinky_01", "thumb_01"]) scaleBone(`${b}_${side}`, fArm);
      for (const b of ["calf", "foot", "ball"]) scaleBone(`${b}_${side}`, fLeg);
    }
    scaleBone("pelvis", fLeg); // altura do quadril acompanha a perna

    const jw1 = joints.map((j) => worldMatrix(j));
    const ibmAcc = skin.getInverseBindMatrices();
    const oldIbm = joints.map((_, i) => ibmAcc.getElement(i, []));
    const newIbm = joints.map((_, i) => mul(invert(jw1[i]), mul(jw0[i], oldIbm[i])));
    ibmAcc.setArray(new Float32Array(newIbm.flat()));
    // Malha da mestre reposta nos ossos novos (skinning linear com os pesos dela).
    const skinMat = joints.map((_, i) => mul(jw1[i], oldIbm[i]));
    mPoints = mPoints.map((p, k) => {
      const i = mIndex[k];
      const jj = mJ.getElement(i, []), wv = mW.getElement(i, []);
      const o = [0, 0, 0];
      for (let t = 0; t < 4; t++) {
        if (wv[t] <= 0) continue;
        const q = applyPoint(skinMat[jj[t]], p);
        for (let a = 0; a < 3; a++) o[a] += wv[t] * q[a];
      }
      return o;
    });
    grid = new Grid(mPoints, 0.05);
    // Casca com os pés no chão: o quadril do esqueleto desceu na mesma medida.
    offset[1] -= sFloor - mFloor;
    const hipNew = jw1[jname("thigh_l")][13];
    console.log(`rig adaptativo: braço ×${fArm.toFixed(3)}, perna ×${fLeg.toFixed(3)} (quadril ${hipY.toFixed(3)} → ${hipNew.toFixed(3)} m), casca ${sFloor - mFloor >= 0 ? "abaixada" : "levantada"} ${(Math.abs(sFloor - mFloor) * 100).toFixed(1)} cm para os pés tocarem o chão`);
    // AVISO de membro encolhido. Existe porque havia um buraco entre os dois
    // portões: o `check-sheet.mjs` confere a FOLHA (2D) e o conversor mede o
    // MODELO (3D), e entre um e outro está a geração no Tripo, que ninguém
    // media. Medido no CRT-006 em 2026-09-20: a folha passou com braço 0,85×,
    // o modelo saiu com 0,652×, e o rig encurtou os ossos em 35% sem dizer
    // nada — o osso passa a cobrir dois terços do braço e o resto anda como
    // toco rígido. É o que se vê no jogo como "mini braço". Três corpos do
    // elenco estavam assim desde 17/09 (CRT-006 0,652, CRT-010 0,796,
    // CRT-007 0,819) e ninguém tinha como saber sem abrir o log.
    //
    // A faixa aceita continua 0,60–1,40 (é o que o rig absorve de fato); isto
    // só levanta a mão quando o encolhimento passa de 15%, que é onde ele
    // começa a aparecer em movimento.
    for (const [nome, f] of [["braço", fArm], ["perna", fLeg]]) {
      if (f >= LIMB_WARN_LO && f <= LIMB_WARN_HI) continue;
      const pct = Math.abs(1 - f) * 100;
      console.log(`  AVISO: ${nome} ×${f.toFixed(3)} — o osso ficou ${pct.toFixed(0)}% ${f < 1 ? "mais curto" : "mais longo"} que o da mestre. A folha passou no portão mas o modelo do Tripo desviou; conferir a ${nome === "braço" ? "envergadura" : "altura da perna"} no visualizador antes de publicar.`);
      if (f <= 0.6001 || f >= 1.3999) console.log(`    (cravado no limite da faixa — a arte está fora do que o rig consegue absorver)`);
    }
    // Segunda causa de "braço curto", e ela NÃO aparece no fator acima: braço
    // do tamanho certo num corpo grande demais. O `fArm` compara a casca com a
    // MESTRE; isto compara o braço com o PRÓPRIO corpo. Medido em 2026-09-20:
    // o Imp tem braço a 44% da altura e a mestre a 47%; o CRT-011 tem
    // `fArm 0,977` (passa limpo) mas mede 1,34 de altura com braço de mestre,
    // e sai a 35% — lê tão atarracado quanto o CRT-006, que chegou lá pelo
    // outro caminho. Abaixo de 40% começa a aparecer.
    {
      const sAligned = allPts.map(align);
      const reach = Math.max(...sAligned.map((p) => p[0])) - Math.abs(shoulder[0]);
      const height = percentile(sAligned.map((p) => p[1]), 0.999) - percentile(sAligned.map((p) => p[1]), 0.001);
      const ratio = reach / height;
      if (ratio < ARM_RATIO_WARN) {
        console.log(`  AVISO: braço a ${(ratio * 100).toFixed(0)}% da altura do corpo (mestre 47%, Imp 44%) — mesmo com fator perto de 1, um corpo alto com braço de mestre lê atarracado. Conferir a proporção na folha.`);
      }
    }
  }

  // --- transferência ------------------------------------------------------

  const jw = [], ww = [];
  const stats = { maxD: 0, sumD: 0, n: 0, far: 0, perJoint: new Map() };
  for (const r of raw) {
    r.aligned = r.pts.map(align);
    r.joints = [];
    r.weights = [];
    r.d0 = [];
    for (const p of r.aligned) {
      const nb = grid.nearest(p, K);
      const d0 = nb[0].d;
      r.d0.push(d0);
      stats.maxD = Math.max(stats.maxD, d0);
      stats.sumD += d0;
      stats.n++;
      if (d0 > FAR_WARN) stats.far++;
      // Mistura por inverso da distância (com piso para o vértice colado).
      const acc = new Map();
      for (const { i, d } of nb) {
        const wgt = 1 / Math.max(d, 1e-4);
        const jj = mJ.getElement(mIndex[i], []), wv = mW.getElement(mIndex[i], []);
        for (let t = 0; t < 4; t++) if (wv[t] > 0) acc.set(jj[t], (acc.get(jj[t]) ?? 0) + wv[t] * wgt);
      }
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = top.reduce((sum, [, w]) => sum + w, 0);
      const jo = [0, 0, 0, 0], wo = [0, 0, 0, 0];
      top.forEach(([j, w], t) => { jo[t] = j; wo[t] = w / total; });
      // Ajuste de arredondamento para somar exatamente 1.
      const drift = 1 - wo.reduce((a, b) => a + b, 0);
      wo[0] += drift;
      r.joints.push(jo);
      r.weights.push(wo);
      stats.perJoint.set(jo[0], (stats.perJoint.get(jo[0]) ?? 0) + 1);
    }
  }
  if (RIGID_APPENDAGES) {
    let comps = 0, verts = 0, skipped = 0;
    const sizes = [];
    for (const r of raw) {
      const idx = r.prim.getIndices();
      if (!idx) continue;
      const n = r.aligned.length;
      const far = r.d0.map((d) => d > APPENDAGE_DIST);
      // Solda por posição: a malha do Tripo duplica vértices nas costuras de
      // UV, e sem isso uma cauda vira dois ou três componentes com pesos
      // diferentes cada — ela se abre na costura (visto em 2026-09-17 nos
      // 14 corpos: caudas divididas e pedaços soltos). Vizinhança é montada
      // sobre o vértice canônico (mesma posição, tolerância 0,1 mm).
      const canon = new Int32Array(n);
      const byPos = new Map();
      for (let i = 0; i < n; i++) {
        const p = r.aligned[i];
        const key = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
        if (byPos.has(key)) canon[i] = byPos.get(key); else { byPos.set(key, i); canon[i] = i; }
      }
      const adj = Array.from({ length: n }, () => []);
      const tri = idx.getArray();
      for (let t = 0; t < tri.length; t += 3) {
        const a = canon[tri[t]], b = canon[tri[t + 1]], c = canon[tri[t + 2]];
        adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
      }
      const members = Array.from({ length: n }, () => []);
      for (let i = 0; i < n; i++) members[canon[i]].push(i);
      const seen = new Uint8Array(n);
      for (let s = 0; s < n; s++) {
        if (canon[s] !== s || !far[s] || seen[s]) continue;
        const comp = [];
        const stack = [s];
        seen[s] = 1;
        while (stack.length) {
          const v = stack.pop();
          comp.push(v);
          for (const u of adj[v]) if (far[u] && !seen[u]) { seen[u] = 1; stack.push(u); }
        }
        const protrude = Math.max(...comp.map((v) => r.d0[v]));
        if (comp.length < 3 || protrude < APPENDAGE_PROTRUDE) { skipped++; continue; }
        // Base: vizinhos do componente que NÃO estão longe (onde ele encosta
        // no corpo). Sem base (ilha solta), a média do próprio componente.
        const ring = new Set();
        for (const v of comp) for (const u of adj[v]) if (!far[u]) ring.add(u);
        const src = ring.size ? [...ring] : comp;
        const acc = new Map();
        for (const v of src) for (let t = 0; t < 4; t++) if (r.weights[v][t] > 0) acc.set(r.joints[v][t], (acc.get(r.joints[v][t]) ?? 0) + r.weights[v][t]);
        const rigid = new Map([...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4));
        const rigidTotal = [...rigid.values()].reduce((a, b) => a + b, 0);
        // Rampa: encostado no corpo (d0 = APPENDAGE_DIST) mantém o peso
        // original, e vai ficando rígido até APPENDAGE_PROTRUDE. Sem a
        // rampa a fronteira rígido/flexível é um corte seco, e abre buraco
        // quando o osso mexe — o segundo defeito visto em 2026-09-17.
        for (const cv of comp) for (const v of members[cv]) {
          const t = clamp((r.d0[v] - APPENDAGE_DIST) / (APPENDAGE_PROTRUDE - APPENDAGE_DIST), 0, 1);
          const mix = new Map();
          for (let k = 0; k < 4; k++) if (r.weights[v][k] > 0) mix.set(r.joints[v][k], (mix.get(r.joints[v][k]) ?? 0) + (1 - t) * r.weights[v][k]);
          for (const [j, w] of rigid) mix.set(j, (mix.get(j) ?? 0) + t * (w / rigidTotal));
          const top = [...mix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
          const total = top.reduce((sum, [, w]) => sum + w, 0);
          const jo = [0, 0, 0, 0], wo = [0, 0, 0, 0];
          top.forEach(([j, w], k) => { jo[k] = j; wo[k] = w / total; });
          wo[0] += 1 - wo.reduce((a, b) => a + b, 0);
          r.joints[v] = jo; r.weights[v] = wo;
          verts++;
        }
        comps++; sizes.push(comp.length);
      }
    }
    sizes.sort((a, b) => b - a);
    console.log(`apêndices rígidos: ${comps} componente(s), ${verts} vértices presos aos ossos da própria base (maiores: ${sizes.slice(0, 8).join(", ") || "—"}); ${skipped} trecho(s) grosso(s) sem protrusão ≥ ${APPENDAGE_PROTRUDE * 100} cm deixados flexíveis`);
  }

  // --- regiões rígidas declaradas ------------------------------------------
  // Depois do passo de apêndice, porque a declaração é a palavra final: quem
  // a espécie chamou de peça única fica peça única, tenha ou não protraído os
  // 7 cm que o passo automático exige para enxergar sozinho.
  const regions = loadRegions(joints);
  if (regions.length > 0) {
    // Fração da altura, com y = 0 no chão e x/z a partir do eixo do corpo —
    // as proporções que se leem na folha 2×2, não metros da mestre.
    const aBox = bounds(raw.flatMap((r) => r.aligned));
    const aH = aBox.mx[1] - aBox.mn[1];
    const cx = (aBox.mn[0] + aBox.mx[0]) / 2;
    const cz = (aBox.mn[2] + aBox.mx[2]) / 2;
    const frac = (p) => [(p[0] - cx) / aH, (p[1] - aBox.mn[1]) / aH, (p[2] - cz) / aH];
    for (const r of raw) r.regionCore = new Uint8Array(r.aligned.length);
    for (const region of regions) {
      let core = 0, ramped = 0;
      for (const r of raw) {
        for (let v = 0; v < r.aligned.length; v++) {
          let bw = 0;
          for (let k = 0; k < 4; k++) if (r.joints[v][k] === region.bone) bw += r.weights[v][k];
          const t = regionMembership(frac(r.aligned[v]), bw, region);
          if (t <= 0) continue;
          if (t >= 1) { core++; r.regionCore[v] = 1; } else ramped++;
          // Mistura o peso atual com o peso rígido (1,0 no osso declarado).
          // t = 1 no núcleo apaga o gradiente por completo; a rampa devolve
          // o peso original ao encostar na fronteira, que é o que impede a
          // costura que a restrição por grafo de esqueleto abria.
          const mix = new Map();
          for (let k = 0; k < 4; k++) if (r.weights[v][k] > 0) mix.set(r.joints[v][k], (mix.get(r.joints[v][k]) ?? 0) + (1 - t) * r.weights[v][k]);
          mix.set(region.bone, (mix.get(region.bone) ?? 0) + t);
          const top = [...mix.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
          const total = top.reduce((sum, [, w]) => sum + w, 0);
          const jo = [0, 0, 0, 0], wo = [0, 0, 0, 0];
          top.forEach(([j, w], k) => { jo[k] = j; wo[k] = w / total; });
          wo[0] += 1 - wo.reduce((a, b) => a + b, 0);
          r.joints[v] = jo; r.weights[v] = wo;
        }
      }
      if (core === 0) console.log(`  AVISO: região "${region.label}" não pegou nenhum vértice no núcleo — conferir os limites contra a folha`);
      console.log(`  "${region.label}" → ${region.boneName}: ${core} vértice(s) rígidos + ${ramped} na rampa de ${region.ramp}`);
    }
    // Relaxamento da fronteira. Fixar a ilha sem isto ABRE RASGO: medido no
    // CRT-012 em 2026-09-19, uma aresta de 1,8 mm esticando para 77 mm, e o
    // número de arestas acima de 200% subindo de 218 para 536. A ilha encosta
    // no gradiente sem transição, e a costura é o degrau entre os dois. Aqui
    // os pesos da faixa vizinha são mediados com os dos vizinhos de malha,
    // algumas voltas, com o núcleo PREGADO — é o mesmo relaxamento laplaciano
    // que um DCC roda depois de pintar peso à mão, e reconstrói a transição
    // que a declaração removeu sem desfazer a ilha.
    let smoothed = 0;
    for (const r of raw) {
      const idx = r.prim.getIndices();
      if (!idx) continue;
      const n = r.aligned.length;
      // Mesma solda por posição do passo de apêndice: sem ela a costura de UV
      // parte a vizinhança e a fronteira relaxa de um lado só.
      const canon = new Int32Array(n);
      const byPos = new Map();
      for (let i = 0; i < n; i++) {
        const p = r.aligned[i];
        const key = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
        if (byPos.has(key)) canon[i] = byPos.get(key); else { byPos.set(key, i); canon[i] = i; }
      }
      const adj = Array.from({ length: n }, () => new Set());
      const tri = idx.getArray();
      for (let t = 0; t < tri.length; t += 3) {
        const a = canon[tri[t]], b = canon[tri[t + 1]], c = canon[tri[t + 2]];
        adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
      }
      // Faixa: quem NÃO está no núcleo mas está a até RINGS passos de quem está.
      const pinned = r.regionCore ?? new Uint8Array(n);
      let front = [];
      for (let i = 0; i < n; i++) if (canon[i] === i && pinned[i]) front.push(i);
      const band = new Set();
      for (let ring = 0; ring < REGION_SMOOTH_RINGS; ring++) {
        const next = [];
        for (const v of front) for (const u of adj[v]) {
          if (pinned[u] || band.has(u)) continue;
          band.add(u); next.push(u);
        }
        front = next;
      }
      if (!band.size) continue;
      const members = Array.from({ length: n }, () => []);
      for (let i = 0; i < n; i++) members[canon[i]].push(i);
      for (let pass = 0; pass < REGION_SMOOTH_PASSES; pass++) {
        const snapshot = new Map();
        for (const v of band) {
          const acc = new Map();
          let count = 0;
          for (const u of [...adj[v], v]) {
            for (let k = 0; k < 4; k++) if (r.weights[u][k] > 0) acc.set(r.joints[u][k], (acc.get(r.joints[u][k]) ?? 0) + r.weights[u][k]);
            count++;
          }
          const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
          const total = top.reduce((sum, [, w]) => sum + w, 0);
          const jo = [0, 0, 0, 0], wo = [0, 0, 0, 0];
          top.forEach(([j, w], k) => { jo[k] = j; wo[k] = w / total; });
          wo[0] += 1 - wo.reduce((a, b) => a + b, 0);
          snapshot.set(v, [jo, wo]);
        }
        for (const [v, [jo, wo]] of snapshot) for (const m of members[v]) { r.joints[m] = jo.slice(); r.weights[m] = wo.slice(); }
      }
      smoothed += band.size;
    }
    if (smoothed > 0) console.log(`  fronteira relaxada: ${smoothed} vértice(s) em ${REGION_SMOOTH_RINGS} anel(éis), ${REGION_SMOOTH_PASSES} passada(s)`);
  }

  console.log(`casamento: distância média ${(stats.sumD / stats.n * 100).toFixed(1)} cm, máxima ${(stats.maxD * 100).toFixed(1)} cm, ${stats.far} vértice(s) além de ${FAR_WARN * 100} cm`);
  if (stats.far > 0) console.log(`  AVISO: ${stats.far} vértice(s) longe da mestre — apêndice sem osso ou silhueta desviada; conferir no visualizador`);
  const top = [...stats.perJoint.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([j, n]) => `${joints[j].getName()} ${n}`).join(", ");
  console.log(`ossos dominantes: ${top}`);

  // --- montagem da saída ---------------------------------------------------
  // Parte do documento da mestre (esqueleto + skin + matrizes de bind) e
  // troca a malha; material e texturas vêm copiados do arquivo do Tripo.

  const out = master;
  const outMesh = out.createMesh("Casca");
  const buffer = mRoot.listBuffers()[0];
  for (const r of raw) {
    const n = r.aligned.length;
    const pos = out.createAccessor("POSITION").setType("VEC3").setArray(new Float32Array(r.aligned.flat())).setBuffer(buffer);
    const nrm = out.createAccessor("NORMAL").setType("VEC3").setArray(new Float32Array(r.nms.flat())).setBuffer(buffer);
    const jnt = out.createAccessor("JOINTS_0").setType("VEC4").setArray(new Uint8Array(r.joints.flat())).setBuffer(buffer);
    const wgt = out.createAccessor("WEIGHTS_0").setType("VEC4").setArray(new Float32Array(r.weights.flat())).setBuffer(buffer);
    const prim = out.createPrimitive().setAttribute("POSITION", pos).setAttribute("NORMAL", nrm).setAttribute("JOINTS_0", jnt).setAttribute("WEIGHTS_0", wgt);
    const uv = r.prim.getAttribute("TEXCOORD_0");
    if (uv) prim.setAttribute("TEXCOORD_0", out.createAccessor("TEXCOORD_0").setType("VEC2").setArray(uv.getArray().slice()).setBuffer(buffer));
    const idx = r.prim.getIndices();
    if (idx) prim.setIndices(out.createAccessor("indices").setType("SCALAR").setArray(idx.getArray().slice()).setBuffer(buffer));
    const srcMat = r.prim.getMaterial();
    if (srcMat) {
      // `copyToDocument` devolve um Map origem → cópia (com texturas junto).
      const copies = copyToDocument(out, shell, [srcMat]);
      prim.setMaterial(copies.get(srcMat));
    }
    outMesh.addPrimitive(prim);
    void n;
  }
  // Substitui a malha da mestre pela casca no MESMO nó (mesma skin, mesma
  // posição na hierarquia sob "Armature").
  const oldMesh = mMeshNode.getMesh();
  mMeshNode.setMesh(outMesh).setName("Casca");
  oldMesh.dispose();
  for (const a of mRoot.listAnimations()) a.dispose();

  await out.transform(prune(), unpartition());
  mkdirSync(dirname(OUT), { recursive: true });
  await io.write(OUT, out);

  const r = out.getRoot();
  console.log(`escrito: ${OUT} (${(statSync(OUT).size / 1e6).toFixed(2)} MB)`);
  console.log(`  malhas ${r.listMeshes().map((m) => m.getName()).join(",")} | skin ${r.listSkins().length} × ${r.listSkins()[0].listJoints().length} ossos | texturas ${r.listTextures().length} | materiais ${r.listMaterials().map((m) => m.getName()).join(",")} | anims ${r.listAnimations().length}`);
  console.log(`próximo passo: pnpm models:publish -- --code <CODE> leva até o jogo; para uma prova solta, abrir no Godot pelo caminho do Imp`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
