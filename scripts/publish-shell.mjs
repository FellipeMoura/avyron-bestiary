import { existsSync, mkdirSync, renameSync, copyFileSync, rmSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

/**
 * Leva uma casca do fluxo "base + casca" da pasta da espécie até o jogo,
 * pelo caminho oficial do projeto, num comando só:
 *
 *   0. guarda o corpo publicado anterior: Meshy vai para
 *      `games/shared-assets/legacy/meshy-publicados/`, formato novo vira
 *      `.model-backups/<CODE>.prev.glb`;
 *   1. `convert-tripo.mjs`: veste `mestre/especies/<CODE>/casca.glb` no
 *      esqueleto da mestre e grava `apps/web/public/models/<CODE>.glb` — o
 *      contrato 1:1 que o `syncModels` do bestiário e o `modelUrl` já usam;
 *   2. apaga um backup cru de era anterior em `.model-backups/<CODE>.glb`;
 *   3. `models:optimize --file <CODE>.glb`: teto de textura e emissivo
 *      morto, só neste arquivo;
 *   4. espelha no repo do jogo: `pnpm game:export` se a API local estiver
 *      de pé (é o caminho canônico — bundle + espelho de todo `.glb`), senão
 *      só este corpo, por cópia direta, para não depender da API para testar;
 *   5. apaga as texturas que o importador do Godot extraiu do corpo anterior
 *      (`<CODE>_*.png|jpg` e seus `.import`), que ficariam órfãs — ele extrai
 *      as do corpo novo no próximo `--import`.
 *
 * Depois: os testes do Godot (impressos no fim).
 *
 *     node scripts/publish-shell.mjs --code CRT-005 [--glb <arquivo já convertido>] [--skip-export]
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const CODE = arg("code", null);
if (!CODE) { console.error("uso: node scripts/publish-shell.mjs --code CRT-XXX [--glb <convertido.glb>] [--skip-export]"); process.exit(1); }
const SPECIES_DIR = resolve(repoRoot, `../mestre/especies/${CODE}`);
const MASTER = resolve(repoRoot, arg("master", "../mestre/manequim-mestre.glb"));
const MODELS_DIR = resolve(repoRoot, "apps/web/public/models");
const BACKUPS = resolve(repoRoot, "apps/web/.model-backups");
const GODOT_MODELS = resolve(repoRoot, process.env.GODOT_REPO ? join(process.env.GODOT_REPO, "models") : "../avyron/models");
const API = process.env.EXPORT_API_URL ?? "http://localhost:5101";
const SKIP_EXPORT = process.argv.includes("--skip-export");
const PRECONVERTED = arg("glb", null) ? resolve(repoRoot, arg("glb", "")) : null;

function run(script, args = []) {
  execFileSync(process.execPath, [join(here, script), ...args], { stdio: "inherit" });
}

async function hasBone(glbPath, name) {
  const { NodeIO } = await import("@gltf-transform/core");
  const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(glbPath);
  return doc.getRoot().listSkins().some((s) => s.listJoints().some((j) => j.getName() === name));
}

async function apiUp() {
  try {
    const res = await fetch(`${API}/creatures/${CODE}`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const target = join(MODELS_DIR, `${CODE}.glb`);

  // 0. o corpo publicado ANTES sai do caminho antes de ser sobrescrito. Se
  //    for Meshy (osso `Hips`), vai para `shared-assets/legacy/` de vez; se já for do
  //    formato novo (osso `pelvis`, republicação), vira `<CODE>.prev.glb` —
  //    uma versão de volta, sempre. É o publish quem guarda, não o
  //    `models:optimize`: desde que não há KTX2, o optimize quase nunca
  //    altera o arquivo e portanto não faz backup.
  if (existsSync(target)) {
    mkdirSync(BACKUPS, { recursive: true });
    const isMeshy = await hasBone(target, "Hips");
    if (isMeshy) {
      const legacyDir = resolve(repoRoot, "../shared-assets/legacy/meshy-publicados");
      mkdirSync(legacyDir, { recursive: true });
      const legacy = join(legacyDir, `${CODE}.glb`);
      if (!existsSync(legacy)) copyFileSync(target, legacy);
      console.log(`## 0. corpo anterior (Meshy) guardado em ${legacy}`);
    } else {
      const prev = join(BACKUPS, `${CODE}.prev.glb`);
      copyFileSync(target, prev);
      console.log(`## 0. corpo anterior (formato novo) guardado como ${prev}`);
    }
  }

  // 1. converter (ou copiar o já convertido)
  if (PRECONVERTED) {
    if (!existsSync(PRECONVERTED)) { console.error(`não encontrado: ${PRECONVERTED}`); process.exit(1); }
    copyFileSync(PRECONVERTED, target);
    console.log(`copiado: ${PRECONVERTED} -> ${target}`);
  } else {
    const casca = join(SPECIES_DIR, "casca.glb");
    if (!existsSync(casca)) { console.error(`casca não encontrada: ${casca}\n(exporte do Tripo Studio como casca.glb na pasta da espécie)`); process.exit(1); }
    console.log(`## 1. convert-tripo: ${casca}`);
    run("convert-tripo.mjs", ["--in", casca, "--out", target, "--master", MASTER]);
  }

  // 2. um backup cru deixado pelo optimize de uma era anterior (KTX2)
  //    confundiria um `--force`; some, porque o `.prev.glb` acima já cobre.
  const staleRaw = join(BACKUPS, `${CODE}.glb`);
  if (existsSync(staleRaw)) rmSync(staleRaw);

  // 3. normalização (teto de textura, emissivo morto) — só neste arquivo
  console.log("## 3. models:optimize");
  run("optimize-models.mjs", ["--file", `${CODE}.glb`]);

  // 4. espelho no jogo
  const mirrored = join(GODOT_MODELS, `${CODE}.glb`);
  if (SKIP_EXPORT) {
    console.log("## 4. export pulado (--skip-export)");
  } else if (await apiUp()) {
    console.log("## 4. game:export (API local de pé)");
    run("export-game-data.mjs");
  } else {
    console.log(`## 4. API local fora do ar (${API}) — espelhando só ${CODE} por cópia, como o export faria`);
    mkdirSync(GODOT_MODELS, { recursive: true });
    copyFileSync(target, mirrored);
  }

  // 5. texturas extraídas do corpo anterior E o `.import` do próprio GLB. O
  //    importador do Godot decide reimportar pelo md5 do arquivo: se o corpo
  //    republicado sair idêntico (SKIP no optimize), ele não re-extrai as
  //    texturas, e apagá-las sozinhas deixa o `.scn` importado sem
  //    dependência (visto no CRT-014 em 2026-09-17). Sem o `.import`, o
  //    próximo `--import` refaz tudo do zero.
  const { readdirSync } = await import("node:fs");
  const stale = readdirSync(GODOT_MODELS).filter((f) => f.startsWith(`${CODE}_`) && /\.(png|jpe?g)(\.import)?$/i.test(f));
  for (const f of stale) rmSync(join(GODOT_MODELS, f));
  const glbImport = `${mirrored}.import`;
  if (existsSync(glbImport)) rmSync(glbImport);
  console.log(`## 5. removidas ${stale.length} textura(s) extraída(s) do corpo anterior e o .import do GLB — rode --import no Godot`);

  console.log(`\npronto: ${mirrored}`);
  console.log("próximo: no repo do jogo, com o Godot do tools/ (path Windows, MSYS_NO_PATHCONV=1 se for Git Bash):");
  console.log(`  godot --headless --path C:/.../avyron --import`);
  console.log(`  godot --headless --path C:/.../avyron --script res://scripts/dev/test_tripo_shell.gd -- --shell /models/${CODE}.glb`);
  console.log(`  godot --headless --path C:/.../avyron --script res://scripts/dev/test_creature_bodies.gd`);
  console.log(`  godot --path C:/.../avyron --script res://scripts/dev/shot_shell.gd -- --a /models/dev/manequim-mestre.glb --b /models/${CODE}.glb --out <captura.png> --clip Walk`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
