import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Gera, por espécie, a pasta de trabalho do fluxo "base + casca": o prompt
 * de desenho preenchido com os dados do catálogo e a folha 2×2 da mestre.
 *
 * ## Por que um prompt-mãe
 *
 * O elenco é redesenhado do zero sobre a mestre (manequim chibi), não
 * restilizado a partir dos cards antigos. O que muda de espécie para
 * espécie é DADO — animal real, elemento, classe, nota de silhueta — e
 * dado vem do bundle, não de digitação. O que não muda é REGRA — pose,
 * quadrantes, "só cresce para fora", direção de arte — e regra vive no
 * template (`../mestre/prompt-especie.template.md`), que é o lugar para
 * ajustar o estilo de todo o elenco de uma vez.
 *
 * A direção de arte e as faixas de cor por elemento são as de
 * `docs/EXTERNAL_AI_PROMPTS.md` ("arquivo científico dark editorial").
 * As dicas de anatomia por espécie ficam em `ANATOMY` abaixo, e valem
 * enquanto `silhouetteNote` no catálogo estiver vazio — quando a nota de
 * campo for cadastrada, ela ganha.
 *
 *     node scripts/species-prompt.mjs --code CRT-005            # uma espécie
 *     node scripts/species-prompt.mjs --map PZ-01               # todas do mapa
 *     node scripts/species-prompt.mjs --code CRT-005 --out ../mestre/especies
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BUNDLE = resolve(repoRoot, arg("bundle", "../avyron/data/bestiary.json"));
const TEMPLATE = resolve(repoRoot, arg("template", "../mestre/prompt-especie.template.md"));
const SHEET = resolve(repoRoot, arg("sheet", "../mestre/manequim/folha-2x2-mestre.png"));
const OUT_ROOT = resolve(repoRoot, arg("out", "../mestre/especies"));
const CODE = arg("code", null);
const MAP = arg("map", null);

/** Direção de arte, de `docs/EXTERNAL_AI_PROMPTS.md`. */
const STYLE = {
  name: "arquivo científico dark editorial",
  text: "a modern zoological plate with real 3D volume: clean stylized forms, a continuous dark technical outline feel, earthy muted palette, and a rare ember-orange accent used sparingly. Readable at small size on screen — big simple shapes, no fine noise, no fur, no gradients that fight the silhouette.",
};

/** Faixa de cor por elemento, de `docs/EXTERNAL_AI_PROMPTS.md`. */
const ELEMENT_BAND = {
  "ELE-001": "ochres, terracottas, burnt brown (ember-orange accent allowed in details)",
  "ELE-002": "abyssal blues, damp grey, night blue",
  "ELE-003": "mosses, olive greens, old amber",
  "ELE-004": "browns, rust, sandstone, light ochre",
  "ELE-005": "lead grey, arc blue, matte silver (ember-orange accent allowed in details)",
};

/** Como a especialização da classe aparece no corpo — linguagem corporal, não anatomia. */
const CLASS_HINT = {
  excavator: "sturdy, planted stance; heavier forearms and hands, built to dig.",
  burrower: "compact and forward-leaning; a pointed head profile and tough shoulders, built to push through.",
  prospector: "light and alert; slimmer surface detail, large attentive eyes, built to search.",
  sifter: "broad, flat features; wide hands or fringed edges, built to filter.",
  crusher: "massive and rounded; thick plating and a heavy jaw, built to bear and to crush.",
};

/** Anatomia do animal real, em uma linha, para o gerador ter de onde tirar
 * os 2–3 traços. Vale enquanto `silhouetteNote` do catálogo estiver vazio. */
const ANATOMY = {
  "CRT-001": "a Cambrian trilobite: a segmented dorsal shield in three lobes, a crescent head shield with two compound eyes, and a row of small marginal spines",
  "CRT-002": "Anomalocaris, the Cambrian apex predator: two large segmented frontal grasping appendages, a ring-shaped mouth of plates, big stalked compound eyes, and rows of swimming lobes along the flanks ending in a tail fan",
  "CRT-003": "Opabinia: five eyes on the head, a long flexible frontal proboscis ending in a claw, and a soft segmented body with lateral lobes and a small tail fan",
  "CRT-004": "Wiwaxia: a low oval body armored with overlapping scale-like sclerites, and two rows of long flat blade-like spines along the back",
  "CRT-005": "Hallucigenia: a slim tube body with seven pairs of long rigid dorsal spines, and tube-like legs with claws; a small bulb-shaped head",
  "CRT-006": "Odaraia: a large bivalved carapace covering the front half of the body, large eyes, and a three-lobed tail fluke",
  "CRT-007": "Omnidens, a giant Cambrian predator: an enormous circular mouth ringed with tooth plates, and a robust wide body",
  "CRT-008": "Marrella: a small arthropod with a head shield bearing two pairs of long backward-curving spines, long antennae, and many slender legs",
  "CRT-009": "Leanchoilia: a pair of large frontal 'great appendages' each ending in three long whip-like flagella, and a segmented body with a pointed tail spine",
  "CRT-010": "Arandaspis, an early jawless fish: a torpedo-shaped body covered in bony armor plates, no fins, tiny eyes at the front and a row of gill openings",
  "CRT-011": "Endoceras, a giant straight-shelled nautiloid: a long straight conical shell, a hooded head with large eyes, and a cluster of tentacles",
  "CRT-012": "Echinosphaerites, a spherical cystoid: a round body covered in polygonal plates with rhomb-shaped pores, and a few short feeding arms on top",
  "CRT-013": "Megalograptus, a sea scorpion: a segmented armored body, a pair of large spined grasping limbs, paddle-like swimming legs and a pointed tail",
  "CRT-014": "Hurdia: a large frontal carapace shaped like a three-part helmet, a round toothed mouth, stalked eyes and flank flaps",
};

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? `{{${k}}}`));
}

function main() {
  if (!CODE && !MAP) {
    console.error("uso: node scripts/species-prompt.mjs --code CRT-XXX | --map PZ-01 [--out ../mestre/especies]");
    process.exit(1);
  }
  for (const p of [BUNDLE, TEMPLATE, SHEET]) if (!existsSync(p)) { console.error(`não encontrado: ${p}`); process.exit(1); }
  const bundle = JSON.parse(readFileSync(BUNDLE, "utf8"));
  const template = readFileSync(TEMPLATE, "utf8");
  const elements = new Map(bundle.elements.map((e) => [e.code, e]));
  const classes = new Map(bundle.classes.map((c) => [c.code, c]));
  const creatures = bundle.creatures.filter((c) => (CODE ? c.code === CODE : c.map === MAP));
  if (creatures.length === 0) { console.error("nenhuma criatura casou com o filtro"); process.exit(1); }

  for (const c of creatures) {
    const el = elements.get(c.element) ?? {};
    const cls = classes.get(c.class) ?? {};
    const role = cls.workFunction?.role ?? "";
    const dir = join(OUT_ROOT, c.code);
    const relDir = `../mestre/especies/${c.code}`;
    const vars = {
      code: c.code,
      name: c.name,
      baseSpecies: c.baseSpecies ?? c.name,
      elementName: el.name ?? c.element,
      elementCode: c.element,
      elementPalette: ELEMENT_BAND[c.element] ?? "earthy muted colors",
      className: cls.name ?? c.class,
      classCode: c.class,
      primaryStat: cls.primaryStat ?? "?",
      role,
      classHint: CLASS_HINT[role] ?? "",
      silhouetteNote: c.silhouetteNote ?? "(vazia no catálogo — usando a dica de anatomia do script)",
      anatomy: c.silhouetteNote ?? ANATOMY[c.code] ?? `the real animal ${c.baseSpecies ?? c.name}, as documented by paleontology`,
      styleName: STYLE.name,
      styleText: STYLE.text,
      dir: relDir,
    };
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "prompt.md"), fill(template, vars));
    copyFileSync(SHEET, join(dir, "folha-2x2.png"));
    console.log(`${c.code} ${c.name.padEnd(18)} -> ${dir}  (${vars.elementName}, ${vars.className}/${role}${c.silhouetteNote ? ", nota do catálogo" : ANATOMY[c.code] ? "" : ", SEM dica de anatomia"})`);
  }
}
main();
