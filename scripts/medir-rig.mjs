import { existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { IDENTITY, mul, trs, invert, applyPoint, worldMatrix, percentile, weldByPosition } from "./lib/glb-math.mjs";

/**
 * Posa um ou mais corpos com os clipes da UAL — do jeito que o jogo posa — e
 * mede a deformação. Serve para comparar duas versões da mestre, ou uma casca
 * publicada contra outra, NAS MESMAS CONDIÇÕES.
 *
 *     node scripts/medir-rig.mjs <a.glb> [<b.glb> ...] [--clips Idle,Walk,...] [--json saida.json]
 *
 * ## Como o jogo posa (e portanto como isto posa)
 *
 * `CharacterRig._build_library` aponta as trilhas da UAL para o esqueleto do
 * corpo. Rotação é LOCAL e ABSOLUTA: o valor do clipe substitui a rotação de
 * repouso do osso. Translação só sobrevive no `pelvis` (as outras são constantes
 * e o importador descarta; o comprimento de osso fica o do corpo), multiplicada
 * por `motion_scale` = altura de repouso do quadril ÷ 0,9167. Ossos que o corpo
 * não tem (`pinky_*`) não fazem falta: são folhas.
 *
 * ## O que cada número diz — e o que não diz
 *
 * - **estiramento** de aresta (|L/L₀ − 1|, imune a movimento rígido): mede
 *   deformação, por região. Alto em JUNTA é dobra (esperado); alto dentro de
 *   cabeça ou mão é defeito.
 * - **resíduo rígido** da cabeça e das mãos: quanto os vértices da peça se
 *   afastam de onde estariam se ela andasse inteira com o osso dela. É a medida
 *   de "a cabeça preserva o volume".
 * - **chão**: o ponto mais baixo da malha em cada quadro de `Idle`/`Walk`/`Run`.
 *   Perto de 0 = pé no chão; negativo = afunda; positivo = flutua.
 * - **mão no Idle**: onde a mão para em relação ao ombro e ao eixo do corpo.
 *
 * Nenhum desses aprova um rig sozinho. O estiramento do braço de um corpo chibi
 * fica perto de 45% com o rig certo (anel do ombro girando ~65° no `Idle`, torção
 * num membro curto e grosso) e nada disso aparece na silhueta; e um rig com a
 * junta FORA do membro pode medir melhor e ler pior. Quem pega esse caso é
 * `rig-overlay.mjs` e a captura na câmera do jogo (`shot_rig.gd`).
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const FILES = [];
for (let i = 2; i < process.argv.length; i++) { if (process.argv[i].startsWith("--")) { i++; continue; } FILES.push(resolve(repoRoot, process.argv[i])); }
const CLIPS = arg("clips", "Idle,Walk,Run,Sprint,Swim,Swim_Idle,Attack,Attack2,Cast,HitReact,Death").split(",");
const JSON_OUT = arg("json", null);
/** `--heat <pasta>`: grava, por corpo e clipe, um mapa de ONDE estica (frente e
 * lado, posição de repouso, cor = pior estiramento das arestas do vértice). */
const HEAT = arg("heat", null) ? resolve(repoRoot, arg("heat", "")) : null;
const ANIM_DIR = resolve(repoRoot, "apps/web/public/models/characters/animations");
const UAL_PELVIS_REST_HEIGHT = 0.9167; // o mesmo de `creature_actor.gd`
const FRAMES = 16;
if (!FILES.length) { console.error("uso: node scripts/medir-rig.mjs <a.glb> [<b.glb> ...] [--clips Idle,Walk] [--json saida.json]"); process.exit(1); }

const REGION = (bone) => (bone === "Head" ? "cabeça" : /^(clavicle|upperarm|lowerarm)_/.test(bone) ? "braço" : /^hand_|^(index|middle|ring|thumb)_/.test(bone) ? "mão" : /^(thigh|calf)_/.test(bone) ? "perna" : /^(foot|ball)_/.test(bone) ? "pé" : "tronco");

function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1; d = Math.abs(d);
  let ka = 1 - t, kb = t;
  if (d < 0.9995) { const th = Math.acos(d), sn = Math.sin(th); ka = Math.sin((1 - t) * th) / sn; kb = Math.sin(t * th) / sn; }
  const o = [0, 1, 2, 3].map((k) => ka * a[k] + s * kb * b[k]);
  const l = Math.hypot(...o); return o.map((v) => v / l);
}
function sample(sampler, time, isRot) {
  const input = sampler.getInput(), output = sampler.getOutput();
  const n = input.getCount();
  const cubic = sampler.getInterpolation() === "CUBICSPLINE";
  const value = (i) => output.getElement(cubic ? i * 3 + 1 : i, []);
  if (time <= input.getScalar(0)) return value(0);
  if (time >= input.getScalar(n - 1)) return value(n - 1);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (input.getScalar(mid) <= time) lo = mid; else hi = mid; }
  if (sampler.getInterpolation() === "STEP") return value(lo);
  const t = (time - input.getScalar(lo)) / (input.getScalar(hi) - input.getScalar(lo));
  const a = value(lo), b = value(hi);
  return isRot ? slerp(a, b, t) : a.map((v, k) => v + (b[k] - v) * t);
}

async function loadClips(io) {
  const clips = new Map();
  for (const lib of ["UAL1", "UAL2"]) {
    const doc = await io.read(resolve(ANIM_DIR, `${lib}.glb`));
    for (const anim of doc.getRoot().listAnimations()) {
      if (!CLIPS.includes(anim.getName())) continue;
      const tracks = [];
      let duration = 0;
      for (const ch of anim.listChannels()) {
        const path = ch.getTargetPath(), bone = ch.getTargetNode().getName();
        if (path === "rotation" || (path === "translation" && bone === "pelvis")) tracks.push({ bone, path, sampler: ch.getSampler() });
        duration = Math.max(duration, ch.getSampler().getInput().getMax([])[0]);
      }
      clips.set(anim.getName(), { tracks, duration });
    }
  }
  return clips;
}

async function loadBody(io, file) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const names = joints.map((j) => j.getName());
  const index = new Map(names.map((n, i) => [n, i]));
  const parent = joints.map((j) => { const p = j.getParentNode(); return p && index.has(p.getName()) ? index.get(p.getName()) : -1; });
  const rest = joints.map((j) => ({ t: j.getTranslation(), q: j.getRotation(), s: j.getScale() }));
  const above = joints[0].getParentNode() ? worldMatrix(joints[0].getParentNode()) : IDENTITY;
  const ibmAcc = skin.getInverseBindMatrices();
  const ibm = joints.map((_, i) => ibmAcc.getElement(i, []));
  const P = [], JW = [];
  const tris = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !node.getSkin()) continue;
    for (const prim of mesh.listPrimitives()) {
      const base = P.length;
      const pos = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
      for (let i = 0; i < pos.getCount(); i++) { P.push(pos.getElement(i, [])); JW.push([J.getElement(i, []), W.getElement(i, [])]); }
      const idx = prim.getIndices().getArray();
      for (let t = 0; t < idx.length; t++) tris.push(base + idx[t]);
    }
  }
  // arestas únicas sobre a malha soldada
  const canon = weldByPosition(P);
  const edges = new Map();
  for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = canon[tris[t + e]], b = canon[tris[t + (e + 1) % 3]];
    if (a === b) continue;
    const key = a < b ? a * 1e6 + b : b * 1e6 + a;
    if (!edges.has(key)) edges.set(key, [Math.min(a, b), Math.max(a, b)]);
  }
  const dominant = JW.map(([jj, ww]) => { let b = 0; for (let k = 1; k < 4; k++) if (ww[k] > ww[b]) b = k; return names[jj[b]]; });
  return { file, names, index, parent, rest, above, ibm, P, JW, canon, edges: [...edges.values()], dominant };
}

/** Matrizes de skinning (mundo · IBM) para uma pose {osso → {q, t}}. */
function pose(body, values) {
  const world = new Array(body.names.length);
  for (let i = 0; i < body.names.length; i++) {
    const r = body.rest[i], v = values.get(body.names[i]);
    const local = trs(v?.t ?? r.t, v?.q ?? r.q, r.s);
    world[i] = mul(body.parent[i] === -1 ? body.above : world[body.parent[i]], local);
  }
  return { world, skin: world.map((w, i) => mul(w, body.ibm[i])) };
}
function skinPoints(body, skinMats) {
  return body.P.map((p, v) => {
    const [jj, ww] = body.JW[v];
    const o = [0, 0, 0];
    for (let k = 0; k < 4; k++) { if (ww[k] <= 0) continue; const q = applyPoint(skinMats[jj[k]], p); o[0] += ww[k] * q[0]; o[1] += ww[k] * q[1]; o[2] += ww[k] * q[2]; }
    return o;
  });
}

const heatJobs = [];
function measure(body, clips) {
  const restPose = pose(body, new Map());
  const restPts = skinPoints(body, restPose.skin);
  const restErr = Math.max(...restPts.map((p, i) => Math.hypot(p[0] - body.P[i][0], p[1] - body.P[i][1], p[2] - body.P[i][2])));
  const pelvisRestY = restPose.world[body.index.get("pelvis")][13];
  const motionScale = pelvisRestY / UAL_PELVIS_REST_HEIGHT;
  const height = Math.max(...body.P.map((p) => p[1])) - Math.min(...body.P.map((p) => p[1]));
  const restLen = body.edges.map(([a, b]) => Math.hypot(restPts[a][0] - restPts[b][0], restPts[a][1] - restPts[b][1], restPts[a][2] - restPts[b][2]));
  const edgeRegion = body.edges.map(([a, b]) => { const ra = REGION(body.dominant[a]), rb = REGION(body.dominant[b]); return ra === rb ? ra : "juntas"; });
  // peças que deveriam andar como bloco: vértices ≥ 95% no osso
  const blocks = {};
  for (const [label, bones] of [["cabeça", ["Head"]], ["mão", ["hand_l", "hand_r"]]]) {
    blocks[label] = bones.map((b) => ({ bone: body.index.get(b), verts: body.dominant.map((d, v) => (d === b ? v : -1)).filter((v) => v >= 0) }));
  }
  const out = { arquivo: basename(body.file), altura: height, quadrilRepouso: pelvisRestY, erroRepousoMm: restErr * 1000, clipes: {} };
  for (const [name, clip] of clips) {
    const stretch = {}; const rigid = { cabeça: [], mão: [] }; const floor = []; const hand = [];
    const worstAt = new Float32Array(body.P.length);
    for (let f = 0; f < FRAMES; f++) {
      const time = clip.duration * f / (FRAMES - 1);
      const values = new Map();
      for (const tr of clip.tracks) {
        if (!body.index.has(tr.bone)) continue;
        const v = values.get(tr.bone) ?? {};
        if (tr.path === "rotation") v.q = sample(tr.sampler, time, true);
        else v.t = sample(tr.sampler, time, false).map((x) => x * motionScale);
        values.set(tr.bone, v);
      }
      const ps = pose(body, values);
      const pts = skinPoints(body, ps.skin);
      body.edges.forEach(([a, b], e) => {
        if (restLen[e] < 1e-5) return;
        const l = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1], pts[a][2] - pts[b][2]);
        (stretch[edgeRegion[e]] ??= []).push(Math.abs(l / restLen[e] - 1));
        (stretch.tudo ??= []).push(Math.abs(l / restLen[e] - 1));
        const st = Math.abs(l / restLen[e] - 1);
        if (st > worstAt[a]) worstAt[a] = st;
        if (st > worstAt[b]) worstAt[b] = st;
      });
      for (const [label, list] of Object.entries(blocks)) for (const { bone, verts } of list) {
        for (const v of verts) { const ideal = applyPoint(ps.skin[bone], body.P[v]); rigid[label].push(Math.hypot(pts[v][0] - ideal[0], pts[v][1] - ideal[1], pts[v][2] - ideal[2])); }
      }
      floor.push(Math.min(...pts.map((p) => p[1])));
      const sh = ps.world[body.index.get("upperarm_l")], hd = ps.world[body.index.get("hand_l")];
      hand.push({ drop: (sh[13] - hd[13]) / height, out: Math.abs(hd[12]) / height });
    }
    if (HEAT) heatJobs.push({ file: `${basename(body.file).replace(/.glb$/, "")}-${name}.png`, P: body.P, canon: body.canon, worstAt });
    const pct = (arr, q) => (arr?.length ? percentile(arr, q) * 100 : null);
    const big = (arr) => arr.reduce((a, b) => (b > a ? b : a), -Infinity);
    const mean = (arr) => (arr?.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    out.clipes[name] = {
      estiramento: Object.fromEntries(Object.entries(stretch).map(([k, v]) => [k, { médio: mean(v) * 100, p95: pct(v, 0.95), máx: big(v) * 100 }])),
      residuoRigidoCm: Object.fromEntries(Object.entries(rigid).map(([k, v]) => [k, { médio: mean(v) * 100, máx: v.length ? big(v) * 100 : null }])),
      chaoCm: { mín: Math.min(...floor) * 100, máx: Math.max(...floor) * 100 },
      maoIdle: { abaixoDoOmbroPctAltura: mean(hand.map((h) => h.drop)) * 100, foraDoEixoPctAltura: mean(hand.map((h) => h.out)) * 100 },
    };
  }
  // sanidade dos pesos
  let unnorm = 0, zero = 0, over4 = 0, single = 0, crossSide = 0, headLeak = 0;
  const headIdx = body.index.get("Head");
  const headMinY = Math.min(...body.P.filter((_, v) => body.dominant[v] === "Head").map((p) => p[1]));
  body.JW.forEach(([jj, ww], v) => {
    const s = ww.reduce((a, b) => a + b, 0);
    if (Math.abs(s - 1) > 1e-3) unnorm++;
    if (s < 1e-6) zero++;
    if (ww.filter((w) => w > 0).length > 4) over4++;
    if (Math.max(...ww) > 0.999) single++;
    const x = body.P[v][0];
    let wrong = 0, hw = 0;
    for (let k = 0; k < 4; k++) {
      const n = body.names[jj[k]];
      if (ww[k] > 0.02 && ((x > 0.03 && /_r$/.test(n)) || (x < -0.03 && /_l$/.test(n)))) wrong += ww[k];
      if (jj[k] === headIdx) hw += ww[k];
    }
    if (wrong > 0.05) crossSide++;
    // Cabeça mandando em vértice bem abaixo dela (ombro, braço, tronco).
    if (hw > 0.05 && body.P[v][1] < headMinY - 0.05) headLeak++;
  });
  out.pesos = { vertices: body.P.length, naoNormalizados: unnorm, semInfluencia: zero, maisDe4: over4, ossoUnicoPct: single / body.P.length * 100, ladoTrocado: crossSide, cabecaVazando: headLeak };
  return out;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of FILES) if (!existsSync(f)) { console.error(`não encontrado: ${f}`); process.exit(1); }
const clips = await loadClips(io);
const missing = CLIPS.filter((c) => !clips.has(c));
if (missing.length) console.log(`clipes ausentes na UAL (ignorados): ${missing.join(", ")}`);
const results = [];
for (const f of FILES) results.push(measure(await loadBody(io, f), clips));

const n = (v, d = 1) => (v === null || v === undefined ? "  —  " : v.toFixed(d).padStart(5));
const label = (r) => r.arquivo.replace(/\.glb$/, "").slice(0, 26).padEnd(26);
console.log("\n== pesos ==");
for (const r of results) console.log(`${label(r)} vért ${r.pesos.vertices} | não normalizados ${r.pesos.naoNormalizados} | sem influência ${r.pesos.semInfluencia} | >4 ossos ${r.pesos.maisDe4} | osso único ${n(r.pesos.ossoUnicoPct, 0)}% | lado trocado ${r.pesos.ladoTrocado} | cabeça vazando ${r.pesos.cabecaVazando} | repouso desvia ${r.erroRepousoMm.toFixed(3)} mm`);
for (const clip of clips.keys()) {
  console.log(`\n== ${clip} ==  estiramento p95 % por região | resíduo rígido (cm) | chão (cm) | mão`);
  for (const r of results) {
    const c = r.clipes[clip], e = c.estiramento;
    console.log(`${label(r)} tudo ${n(e.tudo?.p95)} cabeça ${n(e["cabeça"]?.p95)} tronco ${n(e.tronco?.p95)} braço ${n(e["braço"]?.p95)} mão ${n(e["mão"]?.p95)} perna ${n(e.perna?.p95)} pé ${n(e["pé"]?.p95)} juntas ${n(e.juntas?.p95)} | cabeça ${n(c.residuoRigidoCm["cabeça"].médio, 2)}/${n(c.residuoRigidoCm["cabeça"].máx, 2)} mão ${n(c.residuoRigidoCm["mão"].médio, 2)}/${n(c.residuoRigidoCm["mão"].máx, 2)} | ${n(c.chaoCm.mín)}..${n(c.chaoCm.máx)} | ↓${n(c.maoIdle.abaixoDoOmbroPctAltura, 0)}% →${n(c.maoIdle.foraDoEixoPctAltura, 0)}%`);
  }
}
if (HEAT) {
  mkdirSync(HEAT, { recursive: true });
  const SIZE = 700;
  for (const job of heatJobs) {
    const mn = [0, 1, 2].map((k) => Math.min(...job.P.map((p) => p[k]))), mx = [0, 1, 2].map((k) => Math.max(...job.P.map((p) => p[k])));
    const span = Math.max(mx[0] - mn[0], mx[1] - mn[1]) * 1.1, cy = (mn[1] + mx[1]) / 2;
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE * 2}" height="${SIZE}"><rect width="100%" height="100%" fill="#fff"/>`];
    const order = job.P.map((_, i) => i).sort((a, b) => job.worstAt[job.canon[a]] - job.worstAt[job.canon[b]]);
    for (const i of order) {
      const p = job.P[i], st = Math.min(1, job.worstAt[job.canon[i]] / 0.6); // vermelho cheio em 60%
      const col = `rgb(${Math.round(150 + 105 * st)},${Math.round(165 * (1 - st))},${Math.round(175 * (1 - st))})`;
      const y = (0.5 - (p[1] - cy) / span) * SIZE;
      parts.push(`<circle cx="${((p[0] - (mn[0] + mx[0]) / 2) / span + 0.5) * SIZE}" cy="${y}" r="2" fill="${col}"/>`);
      if (p[0] >= -0.01) parts.push(`<circle cx="${SIZE + ((-p[2] + (mn[2] + mx[2]) / 2) / span + 0.5) * SIZE}" cy="${y}" r="2" fill="${col}"/>`);
    }
    parts.push("</svg>");
    await sharp(Buffer.from(parts.join(""))).png().toFile(resolve(HEAT, job.file));
  }
  console.log(`
mapas de estiramento: ${heatJobs.length} em ${HEAT} (vermelho cheio = 60%)`);
}
if (JSON_OUT) { writeFileSync(resolve(repoRoot, JSON_OUT), JSON.stringify(results, null, 2)); console.log(`\nescrito: ${resolve(repoRoot, JSON_OUT)}`); }
