import { mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

/**
 * Desenha o ESQUELETO por cima da silhueta da malha, de frente e de lado.
 *
 * Existe porque a pergunta "a junta está dentro do membro?" não se responde
 * com número de estiramento nem com teste estrutural — um esqueleto com o
 * cotovelo 11 cm atrás do braço passa nos dois. Aqui se vê.
 *
 * Pontos cinza = vértices da malha; linhas = ossos (pai → filho); bolinhas =
 * juntas. `--weights <osso>` pinta os vértices pelo peso daquele osso
 * (vermelho = 1, cinza = 0), que é como se confere uma ilha de peso.
 *
 *     node scripts/rig-overlay.mjs --in ../mestre/manequim-mestre.glb --out ../mestre/diagnostico/atual [--weights Head] [--size 1000]
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const IN = resolve(repoRoot, arg("in", ""));
const OUT = resolve(repoRoot, arg("out", ""));
const SIZE = Number(arg("size", "1000"));
const WEIGHT_BONE = arg("weights", null);
if (!process.argv.includes("--in") || !process.argv.includes("--out")) {
  console.error("uso: node scripts/rig-overlay.mjs --in <corpo.glb> --out <pasta> [--weights <osso>] [--size px]");
  process.exit(1);
}

function mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }
function world(node) { const p = node.getParentNode(); return p ? mul(world(p), node.getMatrix()) : node.getMatrix(); }

/** Ossos que ganham rótulo: as juntas que o pedido de rig nomeia. */
const LABELED = /^(pelvis|spine_0[123]|neck_01|Head|clavicle_l|upperarm_l|lowerarm_l|hand_l|thigh_l|calf_l|foot_l|ball_l)$/;
const IS_FINGER = /^(index|middle|ring|pinky|thumb)_/;

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(IN);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const jointSet = new Set(joints);
  const wpos = new Map(joints.map((j) => { const m = world(j); return [j, [m[12], m[13], m[14]]]; }));
  const wIndex = WEIGHT_BONE ? joints.findIndex((j) => j.getName() === WEIGHT_BONE) : -1;
  if (WEIGHT_BONE && wIndex === -1) { console.error(`osso "${WEIGHT_BONE}" não existe`); process.exit(1); }

  const verts = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
      for (let i = 0; i < pos.getCount(); i++) {
        let w = 0;
        if (wIndex !== -1 && J && W) { const jj = J.getElement(i, []), ww = W.getElement(i, []); for (let t = 0; t < 4; t++) if (jj[t] === wIndex) w += ww[t]; }
        verts.push({ p: pos.getElement(i, []), w });
      }
    }
  }
  const all = [...verts.map((v) => v.p), ...wpos.values()];
  const mn = [0, 1, 2].map((k) => Math.min(...all.map((p) => p[k])));
  const mx = [0, 1, 2].map((k) => Math.max(...all.map((p) => p[k])));
  const span = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * 1.12;
  const cy = (mn[1] + mx[1]) / 2;

  // frente: câmera em +Z olhando −Z → x da imagem = −x do mundo? Não: de frente
  // para a criatura, a mão ESQUERDA dela (+X) aparece à DIREITA de quem olha.
  const views = {
    frente: { u: (p) => p[0], c: (mn[0] + mx[0]) / 2, depth: (p) => p[2] },
    lado: { u: (p) => -p[2], c: -(mn[2] + mx[2]) / 2, depth: (p) => p[0] }, // câmera em +X: frente (+Z) à esquerda
  };
  mkdirSync(OUT, { recursive: true });
  for (const [name, view] of Object.entries(views)) {
    const X = (p) => ((view.u(p) - view.c) / span + 0.5) * SIZE;
    const Y = (p) => (0.5 - (p[1] - cy) / span) * SIZE;
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="100%" height="100%" fill="#fff"/>`];
    // De lado só o lado esquerdo do corpo (x ≥ 0) mais o eixo, para o braço
    // direito não esconder o esquerdo.
    const vs = name === "lado" ? verts.filter((v) => v.p[0] >= -0.01) : verts;
    for (const v of vs) {
      const fill = wIndex === -1 ? "#9aa3ad" : `rgb(${Math.round(154 + v.w * 90)},${Math.round(163 - v.w * 130)},${Math.round(173 - v.w * 140)})`;
      parts.push(`<circle cx="${X(v.p).toFixed(1)}" cy="${Y(v.p).toFixed(1)}" r="${wIndex === -1 ? 1.3 : 1.8}" fill="${fill}" fill-opacity="${wIndex === -1 ? 0.55 : 0.8}"/>`);
    }
    // régua de altura a cada 10 cm
    for (let h = 0; h <= mx[1] + 0.001; h += 0.1) {
      const y = Y([0, h, 0]);
      parts.push(`<line x1="0" x2="${SIZE}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#dde3ea" stroke-width="1"/><text x="4" y="${(y - 2).toFixed(1)}" font-size="11" fill="#8a94a0" font-family="monospace">${h.toFixed(1)}</text>`);
    }
    for (const j of joints) {
      if (name === "lado" && /_r$/.test(j.getName())) continue;
      const a = wpos.get(j);
      for (const c of j.listChildren()) {
        if (!jointSet.has(c) || (name === "lado" && /_r$/.test(c.getName()))) continue;
        const b = wpos.get(c);
        parts.push(`<line x1="${X(a).toFixed(1)}" y1="${Y(a).toFixed(1)}" x2="${X(b).toFixed(1)}" y2="${Y(b).toFixed(1)}" stroke="${IS_FINGER.test(c.getName()) ? "#e0a030" : "#c2182b"}" stroke-width="${IS_FINGER.test(c.getName()) ? 1.2 : 2.4}"/>`);
      }
    }
    for (const j of joints) {
      const n = j.getName();
      if (name === "lado" && /_r$/.test(n)) continue;
      if (IS_FINGER.test(n)) continue;
      const p = wpos.get(j);
      parts.push(`<circle cx="${X(p).toFixed(1)}" cy="${Y(p).toFixed(1)}" r="4" fill="#0b3d91" stroke="#fff" stroke-width="1"/>`);
      if (LABELED.test(n)) parts.push(`<text x="${(X(p) + 7).toFixed(1)}" y="${(Y(p) - 5).toFixed(1)}" font-size="12" fill="#0b3d91" font-family="monospace">${n}</text>`);
    }
    parts.push("</svg>");
    const file = join(OUT, `${name}${WEIGHT_BONE ? `-${WEIGHT_BONE}` : ""}.png`);
    await sharp(Buffer.from(parts.join(""))).png().toFile(file);
    console.log(`escrito: ${file}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
