import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Folha 2×2 das quatro vistas do gabarito, e o caminho de volta.
 *
 * ## Por que uma folha, e por que 2×2
 *
 * Restilizar as quatro vistas UMA POR VEZ num gerador de imagem dá quatro
 * criaturas parecidas, não uma criatura vista de quatro lados: cor, número
 * de espinhos e formato da cabeça derivam entre as gerações. Numa folha só,
 * o gerador vê as quatro ao mesmo tempo e mantém a identidade entre elas.
 * A folha de contato de `render-master-views.mjs` é 4096×1024, larga demais
 * para a maioria dos geradores (que trabalham perto do quadrado, ≤ 2048);
 * o 2×2 em 2048×2048 cabe em todos e mantém cada vista em 1024².
 *
 * Posições fixas, para o corte de volta ser determinístico:
 *
 *     ┌────────┬────────┐
 *     │ front  │ left   │
 *     ├────────┼────────┤
 *     │ back   │ right  │
 *     └────────┴────────┘
 *
 * ## Uso
 *
 *     node scripts/views-sheet.mjs make  [--views ../mestre/vistas] [--out ../mestre/especies/CRT-XXX/
 *     node scripts/views-sheet.mjs split --in <erestilizada.png> --out <pasta das 4 vistas>
 *
 * `split` aceita a folha em qualquer resolução (o gerador pode devolver
 * 1024² ou 1536²): redimensiona para 2048² antes de cortar, e força o fundo
 * quase branco para branco puro, porque `tripo-multiview-probe.mjs` mede a
 * silhueta por "pixel não branco" e um fundo cinza-claro contaria como corpo.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const VIEW_NAMES = ["front", "left", "back", "right"];
const TILE = 1024;
const SLOTS = { front: [0, 0], left: [TILE, 0], back: [0, TILE], right: [TILE, TILE] };

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function make() {
  const viewsDir = resolve(repoRoot, arg("views", "../mestre/vistas"));
  const out = resolve(repoRoot, arg("out", "../mestre/2x2.png"));
  const tiles = [];
  for (const v of VIEW_NAMES) {
    const p = join(viewsDir, `${v}.png`);
    if (!existsSync(p)) { console.error(`vista ausente: ${p}`); process.exit(1); }
    tiles.push({ input: await sharp(p).resize(TILE, TILE).png().toBuffer(), left: SLOTS[v][0], top: SLOTS[v][1] });
  }
  mkdirSync(dirname(out), { recursive: true });
  await sharp({ create: { width: TILE * 2, height: TILE * 2, channels: 3, background: "#ffffff" } })
    .composite(tiles).png({ compressionLevel: 9 }).toFile(out);
  console.log(`folha 2×2 escrita: ${out}`);
}

async function split() {
  const input = resolve(repoRoot, arg("in", ""));
  const outDir = resolve(repoRoot, arg("out", ""));
  if (!process.argv.includes("--in") || !process.argv.includes("--out")) { console.error("uso: split --in <folha.png> --out <pasta>"); process.exit(1); }
  if (!existsSync(input)) { console.error(`folha não encontrada: ${input}\n(confira o nome do arquivo salvo na pasta)`); process.exit(1); }
  mkdirSync(outDir, { recursive: true });
  const sheet = await sharp(input).resize(TILE * 2, TILE * 2, { fit: "fill" }).png().toBuffer();
  for (const v of VIEW_NAMES) {
    const [left, top] = SLOTS[v];
    const { data, info } = await sharp(sheet).extract({ left, top, width: TILE, height: TILE }).raw().toBuffer({ resolveWithObject: true });
    // Fundo quase branco → branco puro (limiar 235 nos três canais).
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) { data[i] = data[i + 1] = data[i + 2] = 255; }
    }
    const out = join(outDir, `${v}.png`);
    await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png({ compressionLevel: 9 }).toFile(out);
    console.log(`  ${v.padEnd(6)} -> ${out}`);
  }
}

const mode = process.argv[2];
(mode === "make" ? make() : mode === "split" ? split() : Promise.reject(new Error("modo: make | split"))).catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
