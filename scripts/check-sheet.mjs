import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

/**
 * Confere uma folha 2×2 restilizada contra o gabarito da mestre ANTES de
 * gastar geração 3D no Tripo: corta a folha, alinha cada vista à da mestre
 * e mede onde a silhueta do manequim ficou descoberta.
 *
 * ## Por que alinhar
 *
 * O gerador de imagem raramente respeita o enquadramento: desenha a
 * criatura maior, menor ou deslocada no quadrante. Comparar pixel a pixel
 * sem alinhar mede o reenquadramento, não a pose. Aqui cada vista passa por
 * um ajuste 2D de escala uniforme + translação, resolvido por mínimos
 * quadrados APARADOS sobre os contornos (fica com os 70% de pares mais
 * próximos, então espinho e crista caem fora sozinhos) — a mesma ideia do
 * alinhamento 3D em `convert-tripo.mjs`. Depois do ajuste, o que sobra de
 * manequim descoberto é pose ou proporção errada de verdade.
 *
 * ## O que se reporta
 *
 * Por vista: IoU alinhado e o ALCANCE da casca relativo à mestre — cabeça
 * (do ombro ao topo), braços (envergadura, só frente/costas) e pés (do
 * quadril à base). Desde 2026-09-16 o `convert-tripo.mjs` adapta os ossos
 * do braço, da perna e a altura do quadril à casca, então membro 10–30%
 * mais curto não reprova mais; reprova o que sai da faixa 0,6×–1,4× que o
 * rig aceita — membro dobrado, faltando ou fora do quadrante. Grava também
 * a folha de sobreposição já alinhada.
 *
 *     node scripts/check-sheet.mjs --sheet ../mestre/especies/CRT-005/folha-reestilizada.png
 *     node scripts/check-sheet.mjs --code CRT-005            # atalho para a pasta da espécie
 *       [--master-views ../mestre/manequim/vistas-mestre] [--out <pasta>]
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const CODE = arg("code", null);
const SHEET = resolve(repoRoot, arg("sheet", CODE ? `../mestre/especies/${CODE}/folha-reestilizada.png` : ""));
const OUT = resolve(repoRoot, arg("out", dirname(SHEET)));
const MASTER_VIEWS = resolve(repoRoot, arg("master-views", "../mestre/manequim/vistas-mestre"));
const VIEWS = ["front", "left", "back", "right"];
const KEEP = 0.7;
const THRESH = 250;

async function silhouette(path) {
  const { data, info } = await sharp(path).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = data[i] < THRESH ? 1 : 0;
  return { mask, w, h };
}

/** Pontos de contorno (pixel cheio com algum vizinho vazio), subamostrados. */
function contour({ mask, w, h }, step = 2) {
  const pts = [];
  for (let y = 1; y < h - 1; y += step) for (let x = 1; x < w - 1; x += step) {
    const i = y * w + x;
    if (!mask[i]) continue;
    if (!mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) pts.push([x, y]);
  }
  return pts;
}

class Grid2 {
  constructor(points, cell) {
    this.points = points; this.cell = cell; this.map = new Map();
    points.forEach((p, i) => { const k = this.key(p); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(i); });
  }
  key(p) { return `${Math.floor(p[0] / this.cell)},${Math.floor(p[1] / this.cell)}`; }
  nearest(p) {
    const cx = Math.floor(p[0] / this.cell), cy = Math.floor(p[1] / this.cell);
    let best = null;
    for (let r = 0; r < 200; r++) {
      for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) {
        if (Math.abs(x - cx) !== r && Math.abs(y - cy) !== r) continue;
        const b = this.map.get(`${x},${y}`);
        if (!b) continue;
        for (const i of b) { const q = this.points[i]; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (!best || d < best.d) best = { i, d }; }
      }
      if (best && best.d <= r * this.cell) return best;
    }
    return best;
  }
}

/** Similaridade 2D (escala + translação) casca → mestre, por ICP aparado.
 * Parte de vários chutes de escala e fica com o de melhor IoU final: um
 * chute só pela altura da caixa encolhe demais uma criatura com crista ou
 * espinhos (a caixa dela é mais alta que o corpo) e o ICP cai num mínimo
 * local com o corpo inteiro dentro do tronco da mestre. */
function align(shellPts, masterPts, box, shell, master) {
  const grid = new Grid2(masterPts, 16);
  const sb = bbox(shellPts), mb = box;
  const base = (mb.maxY - mb.minY) / (sb.maxY - sb.minY);
  let best = null;
  for (const mult of [0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]) {
    const T = icp(shellPts, grid, masterPts, base * mult, sb, mb);
    const iou = iouOf(warp(shell, master, T), master.mask);
    if (!best || iou > best.iou) best = { ...T, iou };
  }
  return best;
}

function iouOf(a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) inter++; if (a[i] || b[i]) uni++; }
  return uni ? inter / uni : 0;
}

function icp(shellPts, grid, masterPts, s0, sb, mb) {
  let s = s0;
  let tx = (mb.minX + mb.maxX) / 2 - s * (sb.minX + sb.maxX) / 2;
  let ty = mb.maxY - s * sb.maxY; // pés na mesma linha
  for (let iter = 0; iter < 20; iter++) {
    const pairs = shellPts.map((p) => { const a = [p[0] * s + tx, p[1] * s + ty]; const nb = grid.nearest(a); return { p, q: masterPts[nb.i], d: nb.d }; });
    pairs.sort((a, b) => a.d - b.d);
    const kept = pairs.slice(0, Math.floor(pairs.length * KEEP));
    const n = kept.length;
    let pmx = 0, pmy = 0, qmx = 0, qmy = 0;
    for (const { p, q } of kept) { pmx += p[0] / n; pmy += p[1] / n; qmx += q[0] / n; qmy += q[1] / n; }
    let num = 0, den = 0;
    for (const { p, q } of kept) { num += (p[0] - pmx) * (q[0] - qmx) + (p[1] - pmy) * (q[1] - qmy); den += (p[0] - pmx) ** 2 + (p[1] - pmy) ** 2; }
    const s2 = num / den, tx2 = qmx - s2 * pmx, ty2 = qmy - s2 * pmy;
    const delta = Math.abs(s2 - s) + Math.hypot(tx2 - tx, ty2 - ty);
    s = s2; tx = tx2; ty = ty2;
    if (delta < 1e-3) break;
  }
  return { s, tx, ty };
}

function bbox(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { minX, maxX, minY, maxY };
}

/** Reamostra a máscara da casca no espaço da mestre pela similaridade. */
function warp(shell, master, { s, tx, ty }) {
  const out = new Uint8Array(master.w * master.h);
  for (let y = 0; y < master.h; y++) for (let x = 0; x < master.w; x++) {
    const sx = Math.round((x - tx) / s), sy = Math.round((y - ty) / s);
    if (sx < 0 || sy < 0 || sx >= shell.w || sy >= shell.h) continue;
    out[y * master.w + x] = shell.mask[sy * shell.w + sx];
  }
  return out;
}

/**
 * Alcance dos membros da casca em relação à mestre, depois do alinhamento:
 * braço = envergadura na faixa de linhas dos braços (só frente/costas),
 * perna = distância do quadril ao ponto mais baixo, cabeça = do ombro ao
 * ponto mais alto (crista conta — por isso só avisa quando fica ABAIXO).
 * O rig adaptativo de `convert-tripo.mjs` absorve desvios de 0,6× a 1,4×;
 * fora disso o membro está errado de verdade (dobrado, faltando ou fora do
 * quadrante), não só curto.
 */
const REACH_MIN = 0.6;
const REACH_MAX = 1.4;
function reach(masterMask, shellMask, w, h, view) {
  const rows = (mask) => { let minY = h, maxY = -1; for (let i = 0; i < mask.length; i++) if (mask[i]) { const y = (i / w) | 0; if (y < minY) minY = y; if (y > maxY) maxY = y; } return { minY, maxY }; };
  const m = rows(masterMask), s = rows(shellMask);
  const H = m.maxY - m.minY;
  const shoulderY = m.minY + H * 0.36; // linha dos braços na mestre (T-pose)
  const hipY = m.minY + H * 0.58;
  const span = (mask) => { let minX = w, maxX = -1; for (let y = Math.round(shoulderY - H * 0.05); y <= Math.round(shoulderY + H * 0.05); y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < minX) minX = x; if (x > maxX) maxX = x; } return maxX - minX; };
  const out = {
    cabeça: (shoulderY - s.minY) / (shoulderY - m.minY),
    pés: (s.maxY - hipY) / (m.maxY - hipY),
  };
  if (view === "front" || view === "back") out["braços"] = span(shellMask) / span(masterMask);
  return out;
}

async function main() {
  if (!existsSync(SHEET)) { console.error(`folha não encontrada: ${SHEET}`); process.exit(1); }
  const viewsDir = join(OUT, "vistas");
  execFileSync(process.execPath, [join(here, "views-sheet.mjs"), "split", "--in", SHEET, "--out", viewsDir], { stdio: "pipe" });
  mkdirSync(OUT, { recursive: true });

  const tiles = [];
  let sumIou = 0;
  const flags = [];
  console.log(`folha: ${SHEET}\nmestre: ${MASTER_VIEWS}\n`);
  console.log("vista   IoU    escala  cabeça  braços  pés     (alcance da casca ÷ alcance da mestre; o rig adaptativo absorve 0,60×–1,40×)");
  for (const [i, v] of VIEWS.entries()) {
    const master = await silhouette(join(MASTER_VIEWS, `${v}.png`));
    const shell = await silhouette(join(viewsDir, `${v}.png`));
    const mPts = contour(master), sPts = contour(shell);
    const T = align(sPts, mPts, bbox(mPts), shell, master);
    const warped = warp(shell, master, T);
    const r = reach(master.mask, warped, master.w, master.h, v);
    let inter = 0, uni = 0;
    const rgb = Buffer.alloc(master.w * master.h * 3);
    for (let p = 0; p < master.w * master.h; p++) {
      const a = master.mask[p], b = warped[p];
      let c;
      if (a && b) { c = [150, 150, 150]; inter++; uni++; } else if (a) { c = [15, 127, 139]; uni++; } else if (b) { c = [217, 150, 42]; uni++; } else c = [255, 255, 255];
      rgb[p * 3] = c[0]; rgb[p * 3 + 1] = c[1]; rgb[p * 3 + 2] = c[2];
    }
    const iou = uni ? inter / uni : 0;
    sumIou += iou;
    const cell = (name) => (r[name] === undefined ? "   —   " : `${r[name].toFixed(2).padStart(5)}×  `);
    console.log(`${v.padEnd(7)} ${iou.toFixed(3)}  ×${T.s.toFixed(2)}   ${["cabeça", "braços", "pés"].map(cell).join(" ")}`);
    for (const [name, val] of Object.entries(r)) {
      const low = val < REACH_MIN, high = name !== "cabeça" && val > REACH_MAX;
      if (low || high) flags.push(`${v}/${name} ${val.toFixed(2)}×`);
    }
    tiles.push({ input: await sharp(rgb, { raw: { width: master.w, height: master.h, channels: 3 } }).png().toBuffer(), left: i * master.w, top: 0 });
  }
  const outPng = join(OUT, "sobreposicao-folha.png");
  await sharp({ create: { width: 1024 * 4, height: 1024, channels: 3, background: "#fff" } }).composite(tiles).png().toFile(outPng);
  console.log(`\nmédia IoU alinhado: ${(sumIou / VIEWS.length).toFixed(3)}`);
  console.log(`sobreposição: ${outPng} (teal = mestre descoberta, âmbar = só a espécie, cinza = ambos)`);
  console.log(flags.length
    ? `veredito: REFAZER — fora da faixa do rig adaptativo: ${flags.join(", ")}`
    : "veredito: dentro da faixa — pode ir para o Studio (o conversor ajusta braço, perna e quadril à casca)");
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
