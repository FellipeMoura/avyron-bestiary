import { statSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, unpartition } from "@gltf-transform/functions";

/**
 * Extrai uma malha-mestre de um corpo do kit "Dungeon Monsters" (Quaternius):
 * só a malha do corpo, esqueleto e skin intactos, material neutro de argila,
 * sem textura, sem cor de vértice, sem UV extra, sem clipe.
 *
 * A mestre não é arte, é gabarito: o que interessa nela é o esqueleto de 55
 * ossos (nomes da UAL), a pose de repouso e os pesos de skin que a casca de
 * cada criatura herda por proximidade (`convert-tripo.mjs`). Tudo que é
 * acessório (correntes, bastão, presas, roupa) sai, porque entraria na
 * silhueta do gabarito e viraria "traço" de toda espécie.
 *
 *     node scripts/make-master.mjs --in <corpo.glb> --mesh <nome da malha do corpo> --out <mestre.glb>
 *     node scripts/make-master.mjs --in apps/web/public/models/placeholders/dungeon/Puglin.glb --mesh Puglin_Body --out ../mestre/puglin-mestre.glb
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const IN = resolve(repoRoot, arg("in", ""));
const OUT = resolve(repoRoot, arg("out", ""));
const MESH = arg("mesh", "");
if (!MESH || !process.argv.includes("--in") || !process.argv.includes("--out")) {
  console.error("uso: node scripts/make-master.mjs --in <corpo.glb> --mesh <malha do corpo> --out <mestre.glb>");
  process.exit(1);
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(IN);
  const root = doc.getRoot();
  const names = root.listMeshes().map((m) => m.getName());
  if (!names.includes(MESH)) {
    console.error(`malha "${MESH}" não existe; malhas do arquivo: ${names.join(", ")}`);
    process.exit(1);
  }
  const removed = [];
  for (const n of root.listNodes()) {
    const mesh = n.getMesh();
    if (mesh && mesh.getName() !== MESH) { removed.push(mesh.getName()); n.setMesh(null); n.dispose(); }
  }
  const mat = doc.createMaterial("Mestre").setBaseColorFactor([0.62, 0.62, 0.62, 1]).setMetallicFactor(0).setRoughnessFactor(0.85);
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    p.setMaterial(mat);
    for (const sem of p.listSemantics()) if (/^(TEXCOORD_[1-9]|COLOR_\d|TANGENT)$/.test(sem)) p.setAttribute(sem, null);
  }
  for (const a of root.listAnimations()) a.dispose();
  await doc.transform(prune(), unpartition());
  mkdirSync(dirname(OUT), { recursive: true });
  await io.write(OUT, doc);
  const r = doc.getRoot();
  const pos = r.listMeshes()[0].listPrimitives()[0].getAttribute("POSITION");
  const mn = pos.getMin([]), mx = pos.getMax([]);
  console.log(`mestre escrita: ${OUT} (${(statSync(OUT).size / 1e6).toFixed(2)} MB)`);
  console.log(`  malha ${MESH} | removidas: ${removed.join(", ") || "nenhuma"} | ossos ${r.listSkins()[0].listJoints().length} | caixa ${(mx[0] - mn[0]).toFixed(2)} × ${(mx[1] - mn[1]).toFixed(2)} × ${(mx[2] - mn[2]).toFixed(2)} m | texturas ${r.listTextures().length} | anims ${r.listAnimations().length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
