import { mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

/**
 * Renderiza as quatro vistas ortográficas (frente, esquerda, costas, direita)
 * de um `.glb` em PNG, com sombreamento de argila sobre fundo neutro.
 *
 * ## Para que serve
 *
 * É o gabarito de silhueta da malha-mestre (`../mestre/imp-mestre.glb`): as
 * quatro imagens que o `multiview-to-model` do Tripo recebe, depois de cada
 * uma ser restilizada com a espécie. Como as quatro vistas saem da MESMA
 * escala e do MESMO enquadramento, a silhueta que o Tripo reconstrói fica
 * presa à pose de repouso da mestre, que é o que a transferência de pesos
 * exige.
 *
 * ## Por que um rasterizador próprio
 *
 * O Godot em `--headless` não renderiza, e puxar um navegador ou um binding
 * de OpenGL só para projetar 10 mil triângulos seria uma dependência nova
 * para um problema pequeno. Projeção ortográfica + z-buffer + Lambert cabem
 * em cem linhas e o resultado é determinístico byte a byte.
 *
 * ## Convenção de vistas
 *
 * A malha olha para +Z (pés em y=0, mão esquerda em +X, como o glTF manda).
 * `left` é o LADO ESQUERDO DA CRIATURA (câmera em +X), não a esquerda de
 * quem olha — a mesma convenção do visualizador da mestre e a que o Tripo
 * espera nas chaves `front`/`left`/`back`/`right`.
 *
 *     node scripts/render-master-views.mjs [--in ../mestre/imp-mestre.glb] [--out ../mestre/vistas] [--size 1024]
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const IN = resolve(repoRoot, arg("in", "../mestre/imp-mestre.glb"));
const OUT = resolve(repoRoot, arg("out", "../mestre/vistas"));
const SIZE = Number(arg("size", "1024"));
/** Giro em Y (graus) aplicado à malha antes de renderizar. Serve para medir
 * um modelo cuja frente não está em +Z (o Tripo exporta em `+x` por padrão)
 * sem reescrever o arquivo. */
const YAW = Number(arg("yaw", "0")) * Math.PI / 180;
/** `--frame <glb>`: enquadra pela caixa DESSE arquivo em vez da própria. É
 * como se mede um corpo já alinhado à mestre (`convert-tripo.mjs`): no
 * enquadramento dela, espinho ou cauda que estica a caixa não encolhe o
 * corpo na imagem, e a silhueta compara membro com membro. */
const FRAME = arg("frame", null) ? resolve(repoRoot, arg("frame", "")) : null;
const SUPERSAMPLE = 2;
const PADDING = 0.08; // fração da imagem livre em volta da silhueta
const BG = [255, 255, 255];
const CLAY = [158, 166, 174];
const AMBIENT = 0.42;

// Câmera de cada vista: como o eixo X e a profundidade da tela se lêem em
// coordenadas do mundo. Y da tela é sempre o Y do mundo (câmera nivelada).
// `depth` maior = mais perto da câmera.
const VIEWS = {
  front: { sx: (p) => p[0], depth: (p) => p[2] },
  left: { sx: (p) => -p[2], depth: (p) => p[0] },
  back: { sx: (p) => -p[0], depth: (p) => -p[2] },
  right: { sx: (p) => p[2], depth: (p) => -p[0] },
};

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function worldMatrix(node) {
  const p = node.getParentNode();
  return p ? mul(worldMatrix(p), node.getMatrix()) : node.getMatrix();
}
function apply(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

/** Lê todos os triângulos do documento em espaço de mundo. */
async function loadTriangles(path) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path);
  const tris = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    // Malha skinada: as posições já estão no espaço do esqueleto (pose de
    // bind = repouso), então a transformação do nó da malha não se aplica.
    const m = node.getSkin() ? null : worldMatrix(node);
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : pos.getCount();
      const v = [];
      for (let i = 0; i < count; i++) {
        const k = idx ? idx.getScalar(i) : i;
        const p = pos.getElement(k, []);
        v.push(m ? apply(m, p) : p);
        if (v.length === 3) {
          tris.push(v.splice(0, 3));
        }
      }
    }
  }
  return tris;
}

function bounds(tris) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const p of t) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); }
  return { mn, mx };
}

function renderView(tris, view, frame, px) {
  const { center, scale } = frame; // scale: pixels por metro
  const rgb = Buffer.alloc(px * px * 3);
  for (let i = 0; i < px * px; i++) { rgb[i * 3] = BG[0]; rgb[i * 3 + 1] = BG[1]; rgb[i * 3 + 2] = BG[2]; }
  const zbuf = new Float32Array(px * px).fill(-Infinity);
  // Luz vinda de cima, da esquerda da tela e da câmera — no espaço da tela,
  // igual para as quatro vistas, para as imagens lerem como uma série.
  const L = [-0.35, 0.75, 0.56];
  const ln = Math.hypot(...L);
  for (let i = 0; i < 3; i++) L[i] /= ln;

  // Profundidade também em pixels: a normal é calculada no espaço da tela e
  // misturar metros com pixels a deixaria sempre virada para a câmera.
  const toScreen = (p) => [
    (view.sx(p) - center.sx) * scale + px / 2,
    px / 2 - (p[1] - center.y) * scale,
    view.depth(p) * scale,
  ];

  for (const t of tris) {
    const a = toScreen(t[0]), b = toScreen(t[1]), c = toScreen(t[2]);
    // Normal no espaço da tela (x direita, y para cima, z para a câmera).
    const e1 = [b[0] - a[0], -(b[1] - a[1]), b[2] - a[2]];
    const e2 = [c[0] - a[0], -(c[1] - a[1]), c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(...n);
    if (nl === 0) continue;
    n = n.map((v) => v / nl);
    if (n[2] < 0) n = n.map((v) => -v); // dupla face: sempre iluminar o lado visível
    const lambert = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    const shade = AMBIENT + (1 - AMBIENT) * lambert;
    const col = CLAY.map((v) => Math.round(v * shade));

    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(px - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(px - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const qx = x + 0.5, qy = y + 0.5;
        const w0 = ((b[0] - qx) * (c[1] - qy) - (b[1] - qy) * (c[0] - qx)) / area;
        const w1 = ((c[0] - qx) * (a[1] - qy) - (c[1] - qy) * (a[0] - qx)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const i = y * px + x;
        if (z <= zbuf[i]) continue;
        zbuf[i] = z;
        rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2];
      }
    }
  }
  return rgb;
}

function yawed(tris, yaw) {
  if (yaw === 0) return tris;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return tris.map((t) => t.map((p) => [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]));
}

async function main() {
  const tris = yawed(await loadTriangles(IN), YAW);
  const { mn, mx } = bounds(FRAME ? await loadTriangles(FRAME) : tris);
  // Um enquadramento só para as quatro vistas: o maior lado da caixa (em
  // qualquer eixo) cabe na imagem com a margem, e o centro é o da caixa.
  const extent = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  const px = SIZE * SUPERSAMPLE;
  const scale = (px * (1 - 2 * PADDING)) / extent;
  const centerWorld = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];

  mkdirSync(OUT, { recursive: true });
  console.log(`malha: ${tris.length} triângulos, caixa ${(mx[0] - mn[0]).toFixed(2)} × ${(mx[1] - mn[1]).toFixed(2)} × ${(mx[2] - mn[2]).toFixed(2)} m`);
  console.log(`enquadramento: ${extent.toFixed(2)} m em ${SIZE}px (${(scale / SUPERSAMPLE).toFixed(1)} px/m)`);

  const sheets = [];
  for (const [name, view] of Object.entries(VIEWS)) {
    const frame = { center: { sx: view.sx(centerWorld), y: centerWorld[1] }, scale };
    const rgb = renderView(tris, view, frame, px);
    const out = join(OUT, `${name}.png`);
    const img = sharp(rgb, { raw: { width: px, height: px, channels: 3 } }).resize(SIZE, SIZE, { kernel: "lanczos3" });
    await img.clone().png({ compressionLevel: 9 }).toFile(out);
    sheets.push({ input: await img.clone().png().toBuffer(), left: sheets.length * SIZE, top: 0 });
    console.log(`  ${name.padEnd(6)} -> ${out}`);
  }
  const sheet = join(OUT, "folha.png");
  await sharp({ create: { width: SIZE * 4, height: SIZE, channels: 3, background: { r: BG[0], g: BG[1], b: BG[2] } } })
    .composite(sheets)
    .png({ compressionLevel: 9 })
    .toFile(sheet);
  console.log(`  folha  -> ${sheet}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
