import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { IDENTITY, mul, trs, invert, applyVector, worldMatrix, weldByPosition } from "./lib/glb-math.mjs";

/**
 * Constrói a MESTRE do fluxo base + casca do zero: malha do manequim +
 * esqueleto da UAL ajustado ao corpo + pesos próprios.
 *
 *     pnpm models:master                          # grava ../mestre/manequim-mestre.glb
 *     node scripts/build-master.mjs --out <arquivo.glb> [--keep-temp]
 *
 * ## O princípio
 *
 * Um corpo deforma bem quando três coisas independentes estão certas, e cada
 * uma tem o seu lugar neste script — nenhuma se conserta mexendo na outra:
 *
 * - **onde a junta está**: no eixo do membro da malha. Junta na borda do braço
 *   faz a difusão entregar o braço à clavícula e à mão, e o que se vê em jogo é
 *   "mini braço" com ombro quadrado — que parece defeito de peso e não é;
 * - **para onde o osso aponta em repouso**: igual à UAL, porque os clipes
 *   escrevem rotação local ABSOLUTA. Repouso diferente = a malha presa numa
 *   pose e a animação levando para outra;
 * - **quem comanda cada vértice**: difusão sobre a malha, com os limites de
 *   alcance que um corpo chibi pede (ver `finishWeights` e a tabela `limits`).
 *
 * 1. **Malha**: `mestre/manequim/casca.glb` (o manequim aprovado) com a
 *    similaridade CONGELADA abaixo (`MESH_SCALE`/`MESH_OFFSET`): é ela que fixa
 *    a altura de 1,00 m e os pés no chão. Nenhum outro corpo é lido.
 * 2. **Esqueleto**: contrato de 55 ossos = juntas da UAL menos `pinky_*` e
 *    `ball_leaf_*`, na ordem da UAL. Rotação local de repouso = a da UAL, osso a
 *    osso — como os clipes escrevem rotação local ABSOLUTA, isso faz a orientação
 *    global de cada osso, em qualquer quadro, ser a mesma da UAL, e o bind
 *    concordar com a animação. A POSIÇÃO de cada junta é medida na malha (seções
 *    transversais: eixo do braço, punho e tornozelo no estrangulamento, virilha,
 *    esfera da cabeça) e a translação local sai de `R_pai⁻¹ · (P − P_pai)`.
 *    Ossos sem volume (dedos, `*_leaf`) seguem a mão em escala. Matrizes de bind
 *    = inversa do mundo de repouso, então a malha em repouso É a malha aprovada.
 * 3. **Pesos**: difusão (bone heat do Blender, via `pesar-mestre.py`) contra
 *    SEGMENTOS declarados — `Head` da base do crânio ao topo, `hand` do punho à
 *    ponta — sobre a malha soldada; depois o acabamento daqui (ver
 *    `finishWeights`). Nenhum peso herdado entra.
 *
 * O arquivo sai do Node, não do exportador do Blender: o Blender recebe JSON e
 * devolve JSON, e não toca no esqueleto.
 *
 * Depois de rodar: `medir-rig.mjs` para os números, `rig-overlay.mjs` para ver as
 * juntas, e — se a mestre mudou — republicar o elenco (`models:publish:all`).
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const MESH_SRC = resolve(repoRoot, arg("mesh", "../mestre/manequim/casca.glb"));
const REF = resolve(repoRoot, arg("ref", "apps/web/public/models/characters/animations/UAL1.glb"));
const OUT = resolve(repoRoot, arg("out", "../mestre/manequim-mestre.glb"));
const REPORT = resolve(repoRoot, arg("report", join(dirname(OUT), "manequim-mestre.rig.json")));
const KEEP_TEMP = process.argv.includes("--keep-temp");

/**
 * Similaridade casca → espaço da mestre, congelada: o Tripo devolve o manequim
 * normalizado (envergadura 1,0) e estes números o levam a 1,00 m de altura, pés
 * em y = 0, eixo do corpo em x = 0. É constante e não medição porque TODA casca
 * do elenco foi desenhada sobre as vistas do manequim NESTE tamanho — mudar a
 * escala desalinha as 14. Se o manequim for redesenhado, a escala nova é decisão
 * de quem redesenha (altura-alvo), e o elenco é republicado.
 */
const MESH_SCALE = 1.268423;
const MESH_OFFSET = [0.000066, 0.000497, 0.040641];

/** Ossos da UAL que o contrato de 55 não carrega. */
const NOT_IN_CONTRACT = /^(pinky_|ball_leaf_)/;
/** Ossos que deformam. O resto fica no arquivo por compatibilidade com a UAL e
 * não recebe peso: `root` é pivô, `*_leaf` é ponta sem volume, e o manequim não
 * tem dedo modelado — devolver os 20 dedos ao grupo foi MEDIDO em 20/09 e piora
 * o braço em tudo (estiramento médio 11,9% → 21,3% no CRT-012). */
const DEFORM = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
  ...["l", "r"].flatMap((s) => [`clavicle_${s}`, `upperarm_${s}`, `lowerarm_${s}`, `hand_${s}`, `thigh_${s}`, `calf_${s}`, `foot_${s}`, `ball_${s}`])];

// --- seções da malha --------------------------------------------------------

/** Seção pelo plano `eixo = valor`: comprimento-ponderada, então independe da
 * densidade de vértices (centroide de vértice puxa para onde a malha é densa). */
function section(P, tri, axis, value, keep = () => true) {
  let L = 0; const c = [0, 0, 0]; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < tri.length; t += 3) {
    const v = [P[tri[t]], P[tri[t + 1]], P[tri[t + 2]]];
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      const da = a[axis] - value, db = b[axis] - value;
      if ((da < 0) !== (db < 0)) { const k = da / (da - db); pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]); }
    }
    if (pts.length !== 2 || !keep(pts[0]) || !keep(pts[1])) continue;
    const [a, b] = pts;
    const l = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); L += l;
    for (let k = 0; k < 3; k++) { c[k] += l * (a[k] + b[k]) / 2; mn[k] = Math.min(mn[k], a[k], b[k]); mx[k] = Math.max(mx[k], a[k], b[k]); }
  }
  return L > 0 ? { c: c.map((v) => v / L), mn, mx, perim: L } : null;
}

/** Esfera por mínimos quadrados (forma linear: |p|² = 2c·p + (r² − |c|²)). */
function fitSphere(pts) {
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], b = [0, 0, 0, 0];
  for (const p of pts) {
    const row = [2 * p[0], 2 * p[1], 2 * p[2], 1], y = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    for (let i = 0; i < 4; i++) { b[i] += row[i] * y; for (let j = 0; j < 4; j++) A[i][j] += row[i] * row[j]; }
  }
  for (let c = 0; c < 4; c++) {
    let piv = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < 4; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const x = b.map((v, i) => v / A[i][i]);
  return { c: [x[0], x[1], x[2]], r: Math.sqrt(x[3] + x[0] * x[0] + x[1] * x[1] + x[2] * x[2]) };
}

/** Ponto dentro da malha? Paridade de cruzamentos de um raio levemente torto
 * (reto acertaria aresta em malha simétrica). */
function inside(P, tri, p) {
  const d = [0.8017, 0.2673, 0.5345];
  let hits = 0;
  for (let t = 0; t < tri.length; t += 3) {
    const a = P[tri[t]], b = P[tri[t + 1]], c = P[tri[t + 2]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-12) continue;
    const s = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 1e-9) hits++;
  }
  return hits % 2 === 1;
}

/**
 * Marcos anatômicos de UM lado (o esquerdo, x > 0; o direito é medido sobre a
 * malha espelhada). Cada regra diz de onde tirou a razão; onde há proporção, é a
 * do esqueleto da UAL, para o corpo chibi herdar a "anatomia" dos clipes.
 */
function measureSide(P, tri) {
  const H = Math.max(...P.map((p) => p[1]));
  const tipX = Math.max(...P.map((p) => p[0]));
  const STEP = 0.005;

  // BRAÇO — seções x = const acima da cintura.
  const arm = [];
  for (let x = 0.08; x < tipX - 0.004; x += STEP) { const s = section(P, tri, 0, x, (p) => p[1] > 0.45 * H); if (s) arm.push({ x, ...s, ext: s.mx[1] - s.mn[1] }); }
  const at = (list, key, v) => list.reduce((best, s) => (Math.abs(s[key] - v) < Math.abs(best[key] - v) ? s : best));
  // Onde o braço vira um tubo limpo: a altura da seção para de SALTAR para
  // dentro (3 cm adiante ela ainda é a mesma). Mais para dentro a seção já pega
  // o flanco do tronco e salta.
  // A varredura vem do meio do braço PARA DENTRO e para no primeiro salto (de
  // fora para dentro o tubo é garantido; de dentro para fora a seção do tronco
  // inteiro também "não cresce" e enganaria a regra).
  let armStart = tipX * 0.5;
  for (const s of arm.filter((a) => a.x <= tipX * 0.5).reverse()) {
    if (s.ext >= 1.25 * at(arm, "x", s.x + 0.03).ext) break;
    armStart = s.x;
  }
  const startSec = at(arm, "x", armStart + 0.02);
  // Ombro: no eixo do braço, logo para dentro de onde ele emerge (na UAL a junta
  // fica ~2 cm para dentro do deltoide num corpo de 1,83 m).
  const shoulder = [armStart - 0.15 * (startSec.ext / 2), startSec.c[1], startSec.c[2]];
  // Punho: o estrangulamento entre o antebraço e a mão.
  const outer = arm.filter((s) => s.x > armStart + 0.5 * (tipX - armStart) && s.x < tipX - 0.06);
  const wristSec = outer.reduce((a, b) => (b.perim < a.perim ? b : a));
  const wrist = [wristSec.x, wristSec.c[1], wristSec.c[2]];
  // Cotovelo: o manequim é um tubo sem marco; vale a proporção da UAL, em que
  // braço e antebraço têm o mesmo comprimento (0,274 : 0,273).
  const elbowSec = at(arm, "x", (shoulder[0] + wrist[0]) / 2);
  const elbow = [elbowSec.x, elbowSec.c[1], elbowSec.c[2]];
  const tipSec = at(arm, "x", tipX - 0.03);
  const handTip = [tipX - 0.008, tipSec.c[1], tipSec.c[2]];

  // PERNA — seções y = const do lado +x.
  const leg = [];
  for (let y = 0.01; y < 0.5 * H; y += STEP) { const s = section(P, tri, 1, y, (p) => p[0] > 0.0005 && p[0] < 0.3); if (s) leg.push({ y, ...s }); }
  // Virilha: a primeira altura em que a seção cruza o plano do meio.
  let crotch = 0.1;
  while (crotch < 0.6 * H && !section(P, tri, 1, crotch, (p) => Math.abs(p[0]) < 0.004)) crotch += STEP;
  // Tornozelo: estrangulamento acima do pé. A junta fica 2 cm abaixo dele, no
  // topo do pé (na UAL o `foot` está em 0,104 m, abaixo da canela mais fina).
  const ankleSec = leg.filter((s) => s.y > 0.04 * H && s.y < 0.2 * H).reduce((a, b) => (b.perim < a.perim ? b : a));
  const ankle = [ankleSec.c[0], ankleSec.y - 0.02, ankleSec.c[2]];
  // Joelho: o estrangulamento do meio da perna (o manequim tem rótula modelada).
  const kneeSec = leg.filter((s) => s.y > ankleSec.y + 0.08 && s.y < crotch - 0.08).reduce((a, b) => (b.perim < a.perim ? b : a));
  const knee = [kneeSec.c[0], kneeSec.y, kneeSec.c[2]];
  // Quadril: 4 cm acima da virilha (UAL: ~8 cm num corpo de 1,83 m), no eixo da
  // coxa medido logo abaixo dela, onde as duas pernas ainda são seções separadas.
  const thighSec = at(leg, "y", crotch - 0.05);
  const hip = [thighSec.c[0], crotch + 0.04, thighSec.c[2]];
  // Pé: bloco abaixo do tornozelo. `ball` na proporção da UAL entre tornozelo e
  // ponta (0,62), rente ao chão.
  const foot = P.filter((p) => p[0] > 0 && p[1] < ankleSec.y - 0.03);
  const toeZ = Math.max(...foot.map((p) => p[2]));
  const footX = (Math.min(...foot.map((p) => p[0])) + Math.max(...foot.map((p) => p[0]))) / 2;
  const ball = [footX, 0.15 * ankle[1], ankle[2] + 0.62 * (toeZ - ankle[2])];
  const toeTip = [footX, ball[1], toeZ - 0.01];

  return { H, armStart, shoulder, elbow, wrist, handTip, crotch, hip, knee, ankle, ball, toeTip, toeZ };
}

function measureAxis(P, tri, H, hipY, hipZ) {
  // CABEÇA: esfera ajustada à calota (acima de 80% da altura só existe cabeça).
  const head = fitSphere(P.filter((p) => p[1] > 0.8 * H));
  // Junção cabeça/tronco: subindo a partir da base da esfera, a primeira altura
  // em que a largura da seção cai abaixo do raio da cabeça — dali para cima só
  // existe cabeça; abaixo, a seção ainda pega o topo dos ombros.
  let junction = head.c[1] - head.r;
  for (; junction < head.c[1]; junction += 0.005) {
    const s = section(P, tri, 1, junction, (p) => Math.abs(p[0]) < 0.3);
    if (s && Math.max(-s.mn[0], s.mx[0]) < head.r) break;
  }
  const centroidZ = (y) => section(P, tri, 1, y, (p) => Math.abs(p[0]) < 0.2 * H)?.c[2] ?? 0;
  const torsoTopZ = centroidZ(junction - 0.04);
  // `Head` é o pivô da cabeça: na base do crânio, a meio caminho (em z) entre o
  // eixo do tronco e o centro da esfera, que neste manequim avança 4,6 cm.
  const headJoint = [0, junction, (torsoTopZ + head.c[2]) / 2];
  const headTop = [0, head.c[1] + head.r - 0.01, head.c[2]];
  // Pescoço: o manequim não tem; `neck_01` fica 4,5 cm abaixo da junção, dentro
  // do alto do tronco (UAL: 8,3 cm em 1,83 m).
  const neck = [0, junction - 0.045, torsoTopZ];
  // `pelvis`: na UAL fica 1,5 cm abaixo e 5 cm atrás das coxas; aqui, na escala
  // do corpo (~0,45).
  const pelvis = [0, hipY - 0.007, hipZ - 0.022];
  // Coluna: frações da UAL entre `pelvis` e `neck_01` (0,235 / 0,450 / 0,697),
  // com z no eixo do tronco recuado 1,5 cm (a barriga puxa o centroide à frente).
  const spine = [0.235, 0.45, 0.697].map((f) => { const y = pelvis[1] + f * (neck[1] - pelvis[1]); return [0, y, centroidZ(y) - 0.015]; });
  return { head, junction, headJoint, headTop, neck, pelvis, spine };
}

// --- principal --------------------------------------------------------------

function findBlender() {
  if (process.env.BLENDER && existsSync(process.env.BLENDER)) return process.env.BLENDER;
  // LTS portátil, mesmo padrão do Godot: `~/tools/Blender/<versão>/blender.exe`.
  const base = join(homedir(), "tools", "Blender");
  if (existsSync(base)) for (const d of readdirSync(base).sort().reverse()) {
    for (const exe of ["blender.exe", "blender"]) if (existsSync(join(base, d, exe))) return join(base, d, exe);
  }
  console.error(`Blender não encontrado — defina BLENDER=<caminho do executável> ou instale o LTS portátil em ${base}`);
  process.exit(1);
}

/**
 * Acabamento dos pesos que o solver devolve. Cada regra existe por medição
 * (`medir-rig.mjs`), e nenhuma é rigidez ou suavização geral:
 *
 * - **no máximo 4 ossos por vértice, soma 1** — é o que o glTF carrega e o que o
 *   jogo usa; os 4 maiores, renormalizados. Peso abaixo de 1% sai quando há
 *   outro maior: não move nada e só alarga a lista.
 * - **`regions`**: peças que o corpo tem como bloco e a difusão deixa com cauda
 *   de gradiente — ver a lista `regions` no `main`. A rampa é GEOMÉTRICA e
 *   curta, medida para dentro da peça a partir da junta, e o peso original
 *   volta inteiro na fronteira, onde a ilha encosta na transição que a própria
 *   difusão já fez.
 */
function finishWeights(raw, points, { limits, regions, gamma }) {
  return raw.map((row, v) => {
    let mix = new Map(row);
    for (const limit of limits) {
      const k = limit.factor(points[v]);
      if (k >= 1) continue;
      for (const j of limit.bones) if (mix.has(j)) mix.set(j, mix.get(j) * k);
    }
    if (gamma !== 1) mix = new Map([...mix].map(([j, w]) => [j, Math.pow(w, gamma)]));
    // Um limite pode zerar todos os ossos de um vértice (não acontece na malha de
    // hoje; se acontecer, o peso original é melhor que vértice órfão).
    let alive = 0; for (const w of mix.values()) alive += w;
    if (alive <= 1e-9) mix = new Map(row);
    else for (const [j, w] of mix) mix.set(j, w / alive);
    for (const region of regions) {
      const t = region.membership(points[v]);
      if (t <= 0) continue;
      for (const [j, w] of mix) mix.set(j, w * (1 - t));
      mix.set(region.bone, (mix.get(region.bone) ?? 0) + t);
    }
    let top = [...mix.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (top.length > 1) top = top.filter(([, w], i) => i === 0 || w >= 0.01);
    const total = top.reduce((s, [, w]) => s + w, 0);
    return top.map(([j, w]) => [j, w / total]);
  });
}

async function main() {
  for (const p of [MESH_SRC, REF]) if (!existsSync(p)) { console.error(`não encontrado: ${p}`); process.exit(1); }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  // 1. malha
  const src = await io.read(MESH_SRC);
  const prims = src.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  if (prims.length !== 1) { console.error(`esperava UMA primitiva no manequim, achei ${prims.length}`); process.exit(1); }
  const srcPos = prims[0].getAttribute("POSITION"), srcNrm = prims[0].getAttribute("NORMAL");
  const tri = Array.from(prims[0].getIndices().getArray());
  const P = [];
  for (let i = 0; i < srcPos.getCount(); i++) { const p = srcPos.getElement(i, []); P.push([p[0] * MESH_SCALE + MESH_OFFSET[0], p[1] * MESH_SCALE + MESH_OFFSET[1], p[2] * MESH_SCALE + MESH_OFFSET[2]]); }
  console.log(`malha: ${P.length} vértices, ${tri.length / 3} triângulos, altura ${Math.max(...P.map((p) => p[1])).toFixed(3)} m`);

  // 2. marcos — os dois lados, espelhando a malha para medir o direito.
  const L = measureSide(P, tri);
  const R = measureSide(P.map((p) => [-p[0], p[1], p[2]]), tri);
  const SIDE_KEYS = ["shoulder", "elbow", "wrist", "handTip", "hip", "knee", "ankle", "ball", "toeTip"];
  let asym = 0, asymKey = "";
  const M = {};
  for (const k of SIDE_KEYS) {
    const d = Math.hypot(...L[k].map((v, i) => v - R[k][i]));
    if (d > asym) { asym = d; asymKey = k; }
    M[k] = L[k].map((v, i) => (v + R[k][i]) / 2);
  }
  const axis = measureAxis(P, tri, L.H, M.hip[1], M.hip[2]);
  console.log(`marcos: braço emerge em x ${L.armStart.toFixed(3)} | punho x ${M.wrist[0].toFixed(3)} | virilha y ${L.crotch.toFixed(3)} | joelho y ${M.knee[1].toFixed(3)} | tornozelo y ${M.ankle[1].toFixed(3)} | junção cabeça/tronco y ${axis.junction.toFixed(3)} | cabeça centro (${axis.head.c.map((v) => v.toFixed(3)).join(", ")}) raio ${axis.head.r.toFixed(3)}`);
  console.log(`assimetria esquerda/direita: máxima ${(asym * 1000).toFixed(1)} mm (${asymKey}) — as juntas usam a média dos dois lados`);

  // 3. esqueleto: contrato + posições
  const ref = await io.read(REF);
  const refJoints = ref.getRoot().listSkins()[0].listJoints().filter((j) => !NOT_IN_CONTRACT.test(j.getName()));
  const refByName = new Map(refJoints.map((j) => [j.getName(), j]));
  const refWorld = new Map(refJoints.map((j) => [j.getName(), worldMatrix(j)]));
  const refPos = (n) => { const m = refWorld.get(n); return [m[12], m[13], m[14]]; };
  const parentOf = (j) => { const p = j.getParentNode(); return p && refByName.has(p.getName()) ? p.getName() : null; };
  if (refJoints.length !== 55) { console.error(`contrato quebrado: ${refJoints.length} ossos (esperado 55) — a UAL mudou?`); process.exit(1); }

  const pos = new Map();
  pos.set("root", [0, 0, 0]);
  pos.set("pelvis", axis.pelvis);
  ["spine_01", "spine_02", "spine_03"].forEach((n, i) => pos.set(n, axis.spine[i]));
  pos.set("neck_01", axis.neck);
  pos.set("Head", axis.headJoint);
  // Proporção da mão: punho → ponta, contra punho → ponta do dedo médio na UAL.
  const handScale = (M.handTip[0] - M.wrist[0]) / (refPos("middle_04_leaf_l")[0] - refPos("hand_l")[0]);
  for (const [side, sx] of [["l", 1], ["r", -1]]) {
    const mir = (p) => [sx * p[0], p[1], p[2]];
    // Clavícula: nasce junto ao esterno, à frente e pouco acima do ombro (UAL:
    // x a 10% do ombro, 1,7 cm acima, 13,6 cm à frente — aqui na escala do corpo).
    pos.set(`clavicle_${side}`, mir([0.1 * M.shoulder[0], M.shoulder[1] + 0.008, M.shoulder[2] + 0.045]));
    pos.set(`upperarm_${side}`, mir(M.shoulder));
    pos.set(`lowerarm_${side}`, mir(M.elbow));
    pos.set(`hand_${side}`, mir(M.wrist));
    pos.set(`thigh_${side}`, mir(M.hip));
    pos.set(`calf_${side}`, mir(M.knee));
    pos.set(`foot_${side}`, mir(M.ankle));
    pos.set(`ball_${side}`, mir(M.ball));
  }
  // Dedos e pontas: sem volume na malha, seguem a mão na escala dela. Como a
  // orientação global é a da UAL, o deslocamento de mundo escala direto.
  for (const j of refJoints) {
    const n = j.getName();
    if (pos.has(n)) continue;
    let anchor = parentOf(j);
    while (!/^hand_[lr]$/.test(anchor)) anchor = parentOf(refByName.get(anchor));
    const a = refPos(anchor), p = refPos(n), base = pos.get(anchor);
    pos.set(n, [0, 1, 2].map((k) => base[k] + handScale * (p[k] - a[k])));
  }

  // Toda junta que deforma tem de estar DENTRO da malha, senão o solver de
  // difusão não a enxerga (foi o defeito do braço). Falha dura.
  const outside = DEFORM.filter((n) => !inside(P, tri, pos.get(n)));
  if (outside.length) { console.error(`junta(s) fora da malha: ${outside.join(", ")} — o ajuste do esqueleto falhou; conferir com rig-overlay.mjs`); process.exit(1); }

  // Rotação local = UAL; translação local = R_pai⁻¹ · (P − P_pai).
  const local = new Map(), worldRot = new Map();
  for (const j of refJoints) {
    const n = j.getName(), par = parentOf(j);
    const parentW = par ? worldRot.get(par) : IDENTITY;
    worldRot.set(n, mul(parentW, trs([0, 0, 0], j.getRotation())));
    const pp = par ? pos.get(par) : [0, 0, 0], p = pos.get(n);
    const t = applyVector(invert(parentW), [p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]]);
    local.set(n, { t, q: [...j.getRotation()] });
    for (const s of j.getScale()) if (Math.abs(s - 1) > 1e-5) { console.error(`a UAL tem escala em ${n}; o construtor não cobre isso`); process.exit(1); }
  }

  // 4. pesos — difusão no Blender sobre a malha soldada
  const canon = weldByPosition(P);
  const weldedIndex = new Map(); const welded = [];
  for (let i = 0; i < P.length; i++) if (canon[i] === i) { weldedIndex.set(i, welded.length); welded.push(P[i]); }
  const wtri = [];
  for (let t = 0; t < tri.length; t += 3) {
    const a = weldedIndex.get(canon[tri[t]]), b = weldedIndex.get(canon[tri[t + 1]]), c = weldedIndex.get(canon[tri[t + 2]]);
    if (a !== b && b !== c && a !== c) wtri.push([a, b, c]);
  }
  const tails = { pelvis: "spine_01", spine_01: "spine_02", spine_02: "spine_03", spine_03: "neck_01", neck_01: "Head" };
  for (const s of ["l", "r"]) Object.assign(tails, { [`clavicle_${s}`]: `upperarm_${s}`, [`upperarm_${s}`]: `lowerarm_${s}`, [`lowerarm_${s}`]: `hand_${s}`, [`thigh_${s}`]: `calf_${s}`, [`calf_${s}`]: `foot_${s}`, [`foot_${s}`]: `ball_${s}` });
  const tipOf = (n) => {
    if (tails[n]) return pos.get(tails[n]);
    if (n === "Head") return axis.headTop;
    const sx = n.endsWith("_r") ? -1 : 1;
    const tip = n.startsWith("hand_") ? M.handTip : M.toeTip;
    return [sx * tip[0], tip[1], tip[2]];
  };
  const REUSE = arg("reuse", null);
  const solverBones = DEFORM.map((n) => ({ name: n, head: pos.get(n), tail: tipOf(n), parent: DEFORM.includes(parentOf(refByName.get(n))) ? parentOf(refByName.get(n)) : null }));
  const work = join(tmpdir(), `avyron-mestre-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const fitJson = join(work, "fit.json"), weightsJson = join(work, "pesos.json");
  writeFileSync(fitJson, JSON.stringify({ vertices: welded, triangles: wtri, bones: solverBones }));
  console.log(`solda: ${P.length} → ${welded.length} vértices; difusão no Blender…`);
  if (REUSE) { console.log(`  (reaproveitando ${REUSE} — só para iterar no acabamento; o arquivo oficial sai sem --reuse)`); writeFileSync(weightsJson, readFileSync(resolve(repoRoot, REUSE))); }
  const log = REUSE ? "" : execFileSync(findBlender(), ["--background", "--python", join(here, "pesar-mestre.py"), "--", "--in", fitJson, "--out", weightsJson], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  for (const line of log.split(/\r?\n/)) if (/^(pesos:|ERRO|AVISO)|Bone Heat/i.test(line)) console.log(`  blender: ${line}`);
  const solved = JSON.parse(readFileSync(weightsJson, "utf8"));
  if (solved.orphans > 0) { console.error(`o solver deixou ${solved.orphans} vértice(s) sem influência — a malha tem trecho que nenhum osso enxerga`); process.exit(1); }

  const contract = refJoints.map((j) => j.getName());
  const jointIndex = new Map(contract.map((n, i) => [n, i]));
  const rawRows = solved.weights.map((row) => row.map(([b, w]) => [jointIndex.get(solved.bones[b]), w]));

  const ramp = (d, from, to) => Math.min(1, Math.max(0, (d - from) / (to - from)));
  const bonesOf = (...names) => names.map((n) => jointIndex.get(n));
  // Limites de alcance — onde a difusão VAZA neste corpo. Num chibi o tronco é
  // largo e os membros são curtos: o osso do braço passa a 1 cm do flanco e o da
  // coxa a 3 cm da barriga, então a difusão lhes entrega uma faixa do tronco que
  // nenhum rig à mão pintaria. Medido em 20/09 no `Idle` (braço desce ~65°): o
  // flanco inteiro abaixo da axila esticava mais de 60% (mapa de
  // `medir-rig.mjs --heat`). Cada limite multiplica o peso dos ossos citados por
  // um fator geométrico e devolve o resto aos ossos que sobram (renormalização).
  const limits = [["l", 1], ["r", -1]].flatMap(([s, sx]) => [
    // Cadeia do braço: só manda de onde o braço emerge do tronco para fora.
    { bones: bonesOf(`upperarm_${s}`, `lowerarm_${s}`, `hand_${s}`), factor: (p) => ramp(sx * p[0], L.armStart - 0.035, L.armStart + 0.015) },
    // Clavícula: ombro e alto do peito; não desce pelo flanco.
    { bones: bonesOf(`clavicle_${s}`), factor: (p) => ramp(p[1], M.shoulder[1] - 0.11, M.shoulder[1] - 0.05) },
    // Lado: osso de um lado não comanda vértice claramente do outro. A difusão
    // deixa a coxa e a clavícula opostas com 5–15% numa faixa de barriga e de
    // peito além do plano do meio (136 vértices medidos); perto do meio (virilha,
    // esterno) os dois lados mandam de verdade, e por isso é rampa entre 2 e 5 cm.
    // É a MESMA trava que o `convert-tripo.mjs` aplica às cascas (`SIDE_GUARD`).
    { bones: contract.filter((n) => n.endsWith(`_${s}`)).map((n) => jointIndex.get(n)), factor: (p) => 1 - ramp(-sx * p[0], 0.02, 0.05) },
    // Coxa: até a linha do quadril, com uma faixa curta de barriga acima dela.
    { bones: bonesOf(`thigh_${s}`, `calf_${s}`), factor: (p) => 1 - ramp(p[1], M.hip[1], M.hip[1] + 0.07) },
  ]);
  // Peças rígidas — ver `finishWeights`. Rampa medida para dentro da peça.
  const regions = [
    // Cabeça: tudo que está na esfera ajustada e acima da junção é crânio. A
    // rampa começa na junção e fecha 5 cm acima — abaixo disso fica a transição
    // de pescoço que a difusão pintou. A largura foi medida (3 / 5 / 8 cm): o
    // resíduo rígido médio da cabeça cai pela metade nas três (Idle 0,37 → 0,18 /
    // 0,20 / 0,24 cm), e quanto mais curta a rampa, mais a faixa do pescoço
    // estica quando a cabeça tomba (Cast, p95 da região: 41% / 36% / 32%, contra
    // 27% sem ilha). 5 cm é o meio: crânio rígido sem vincar o pescoço.
    { bone: jointIndex.get("Head"), membership: (p) => (Math.hypot(p[0] - axis.head.c[0], p[1] - axis.head.c[1], p[2] - axis.head.c[2]) < axis.head.r * 1.08 ? ramp(p[1], axis.junction, axis.junction + 0.05) : 0) },
    // Mãos: do punho para fora é um bloco (o manequim não tem dedo modelado).
    ...[["l", 1], ["r", -1]].map(([s, sx]) => ({ bone: jointIndex.get(`hand_${s}`), membership: (p) => ramp(sx * p[0], M.wrist[0] + 0.005, M.wrist[0] + 0.035) })),
  ];
  // `--gamma` > 1 afia as transições (w^γ). Fica só para remedir: MEDIDO em
  // 20/09, afiar PIORA — p95 do braço no Idle 47% → 53% (γ 1,5) → 57% (γ 2), e o
  // das juntas 38% → 50% → 66%. Braço curto e grosso precisa de transição larga
  // para repartir a torção; ilha estreita vinca.
  const GAMMA = Number(arg("gamma", "1"));
  const rows = finishWeights(rawRows, welded, {
    limits: process.argv.includes("--no-limits") ? [] : limits,
    regions: process.argv.includes("--no-regions") ? [] : regions,
    gamma: GAMMA,
  });

  // 5. documento
  const doc = new Document();
  doc.getRoot().getAsset().generator = "avyron-bestiary build-master.mjs";
  const buffer = doc.createBuffer();
  const armature = doc.createNode("Armature");
  doc.createScene("Scene").addChild(armature);
  const nodes = new Map();
  for (const j of refJoints) { const n = j.getName(); const { t, q } = local.get(n); nodes.set(n, doc.createNode(n).setTranslation(t).setRotation(q)); }
  for (const j of refJoints) { const par = parentOf(j); (par ? nodes.get(par) : armature).addChild(nodes.get(j.getName())); }
  const skin = doc.createSkin("Armature").setSkeleton(nodes.get("root"));
  const ibm = [];
  let worst = 0;
  for (const n of contract) {
    skin.addJoint(nodes.get(n));
    const w = worldMatrix(nodes.get(n));
    worst = Math.max(worst, Math.hypot(w[12] - pos.get(n)[0], w[13] - pos.get(n)[1], w[14] - pos.get(n)[2]));
    ibm.push(...invert(w));
  }
  if (worst > 1e-5) { console.error(`o esqueleto montado não caiu nas posições medidas (desvio ${worst})`); process.exit(1); }
  skin.setInverseBindMatrices(doc.createAccessor("bind").setType("MAT4").setArray(new Float32Array(ibm)).setBuffer(buffer));

  const J = new Uint8Array(P.length * 4), W = new Float32Array(P.length * 4);
  for (let i = 0; i < P.length; i++) {
    const row = rows[weldedIndex.get(canon[i])];
    let sum = 0;
    row.forEach(([j, w], k) => { J[i * 4 + k] = j; W[i * 4 + k] = Math.fround(w); sum += Math.fround(w); });
    W[i * 4] += 1 - sum; // arredondamento de float32 cai no osso dominante
  }
  const material = doc.createMaterial("Mestre").setBaseColorFactor([0.62, 0.62, 0.62, 1]).setMetallicFactor(0).setRoughnessFactor(0.85);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor("POSITION").setType("VEC3").setArray(new Float32Array(P.flat())).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor("NORMAL").setType("VEC3").setArray(srcNrm.getArray().slice()).setBuffer(buffer))
    .setAttribute("JOINTS_0", doc.createAccessor("JOINTS_0").setType("VEC4").setArray(J).setBuffer(buffer))
    .setAttribute("WEIGHTS_0", doc.createAccessor("WEIGHTS_0").setType("VEC4").setArray(W).setBuffer(buffer))
    .setIndices(doc.createAccessor("indices").setType("SCALAR").setArray(new Uint32Array(tri)).setBuffer(buffer))
    .setMaterial(material);
  armature.addChild(doc.createNode("Mestre").setMesh(doc.createMesh("Mestre").addPrimitive(prim)).setSkin(skin));

  mkdirSync(dirname(OUT), { recursive: true });
  await io.write(OUT, doc);

  // 6. relatório — o que foi medido e onde cada junta ficou, para o overlay, a
  //    documentação e o próximo que precisar entender de onde saiu um número.
  const single = rows.filter((r) => r.length === 1).length;
  const dom = new Map();
  for (const r of rows) dom.set(contract[r[0][0]], (dom.get(contract[r[0][0]]) ?? 0) + 1);
  writeFileSync(REPORT, JSON.stringify({
    geradoPor: "scripts/build-master.mjs", malha: { fonte: "manequim/casca.glb", escala: MESH_SCALE, deslocamento: MESH_OFFSET, vertices: P.length },
    marcos: { bracoEmerge: L.armStart, virilha: L.crotch, juncaoCabecaTronco: axis.junction, cabeca: axis.head, assimetriaMaxMm: asym * 1000 },
    juntas: Object.fromEntries(contract.filter((n) => DEFORM.includes(n) || n === "root").map((n) => [n, pos.get(n).map((v) => Number(v.toFixed(4)))])),
    pesos: { ossosQueDeformam: DEFORM.length, vertices: rows.length, ossoUnicoPct: Number((single / rows.length * 100).toFixed(1)), dominantes: Object.fromEntries([...dom.entries()].sort((a, b) => b[1] - a[1])) },
  }, null, 2));

  console.log(`juntas (m): ${["pelvis", "spine_03", "neck_01", "Head", "upperarm_l", "lowerarm_l", "hand_l", "thigh_l", "calf_l", "foot_l", "ball_l"].map((n) => `${n} (${pos.get(n).map((v) => v.toFixed(3)).join(", ")})`).join(" | ")}`);
  console.log(`pesos: ${rows.length} vértices soldados, osso único ${(single / rows.length * 100).toFixed(0)}% | dominantes: ${[...dom.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(", ")}`);
  console.log(`escrito: ${OUT} (${(statSync(OUT).size / 1e6).toFixed(2)} MB) + ${REPORT}`);
  if (KEEP_TEMP) console.log(`temporários mantidos em ${work}`);
  else { const { rmSync } = await import("node:fs"); rmSync(work, { recursive: true, force: true }); }
}

main().catch((err) => { console.error(err); process.exit(1); });
