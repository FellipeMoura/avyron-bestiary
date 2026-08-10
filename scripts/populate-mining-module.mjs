/**
 * One-shot script: populates the mining module data on a running API.
 * Run AFTER deploying the /mining-rates endpoint to the target environment.
 *
 *   node scripts/populate-mining-module.mjs                          # local
 *   node scripts/populate-mining-module.mjs --api https://bestiary.sysnode.com.br --key api_H8m...
 *
 * Safe to re-run: all writes are upserts (items use unique codes, mining-rates
 * use upsert semantics). Running twice leaves the same state.
 */

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg("api", process.env.EXPORT_API_URL ?? "http://localhost:5101") + "/api/v1";
const KEY = arg("key", process.env.PROD_API_KEY ?? process.env.API_KEY ?? "change-me-before-running");

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function patch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

console.log(`target: ${BASE}`);

// ---------------------------------------------------------------------------
// 1. Mineral items (12 SKUs)
// ---------------------------------------------------------------------------

console.log("\n[1/4] Creating mineral items...");
const itemsResult = await post("/items/batch", {
  items: [
    { code: "ITM-001", name: "Pedra", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Mineral basico de construcao" },
    { code: "ITM-002", name: "Ferro", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Mineral estrutural de construcao e ferramentas" },
    { code: "ITM-003", name: "Carvao", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Combustivel; nao serve como moeda de troca com o comerciante" },
    { code: "ITM-004", name: "Cobre", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Moeda de troca cotidiana com o comerciante (food de HP e itens de baixo valor)" },
    { code: "ITM-005", name: "Prata", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Moeda premium; troca por cards com o comerciante" },
    { code: "ITM-006", name: "Ambar Fossil", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Mineral raro; troca por cards e flavor tematico; forte conexao com Loricati (ambar preserva insetos)" },
    { code: "ITM-007", name: "Cristal Elemental — Fogo", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Vinculado ao elemento Fogo (ELE-001); material para Despertar Ancestral e habilidades" },
    { code: "ITM-008", name: "Cristal Elemental — Agua", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Vinculado ao elemento Agua (ELE-002); material para Despertar Ancestral e habilidades" },
    { code: "ITM-009", name: "Cristal Elemental — Natureza", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Vinculado ao elemento Natureza (ELE-003); material para Despertar Ancestral e habilidades" },
    { code: "ITM-010", name: "Cristal Elemental — Terra", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Vinculado ao elemento Terra (ELE-004); material para Despertar Ancestral e habilidades" },
    { code: "ITM-011", name: "Cristal Elemental — Eletricidade", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Vinculado ao elemento Eletricidade (ELE-005); material para Despertar Ancestral e habilidades" },
    { code: "ITM-012", name: "Cristal Elemental — Gelo", category: "mineral", effect: null, acquisition: "Mineracao", notes: "Vinculado ao elemento Gelo (ELE-006); material para Despertar Ancestral e habilidades" },
  ],
  reason: "Criacao dos 12 minerais do modulo de mineracao: 6 minerais base e 6 cristais elementais (um por elemento)",
  impact: "Habilita o sistema de mineracao por criaturas domesticadas; minerais servem de moeda com o comerciante e material para Despertar Ancestral",
});
console.log(`  created: ${itemsResult.codes.join(", ")}  (version ${itemsResult.version})`);

// ---------------------------------------------------------------------------
// 2. workFunction on creature classes
// ---------------------------------------------------------------------------

console.log("\n[2/4] Patching workFunction on creature classes...");

const patches = [
  {
    code: "CLS-001",
    workFunction: JSON.stringify({ speedModifier: 1.0, preferredOres: ["fossilAmber", "stone", "iron"], role: "excavator" }),
    reason: "Loricati tem exoesqueleto rigido adaptado a escavacao; afinidade tematica com ambar fossil (preservacao de insetos ancestrais)",
    impact: "Define o perfil de mineracao da classe no sistema de trabalho de criaturas domesticadas",
  },
  {
    code: "CLS-002",
    workFunction: JSON.stringify({ speedModifier: 1.1, preferredOres: ["coal", "copper"], role: "burrower" }),
    reason: "Theria (proto-mamiferos) sao construtores de tocas subterraneas; mineracao utilitaria com foco em carvao (combustivel) e cobre (troca cotidiana)",
    impact: "Define o perfil de mineracao da classe no sistema de trabalho de criaturas domesticadas",
  },
  {
    code: "CLS-003",
    workFunction: JSON.stringify({ speedModifier: 0.9, preferredOres: ["elementalCrystal", "silver"], role: "prospector" }),
    reason: "Draconis (sauropsideos) tem adaptacao ambiental e termica ligada ao sistema elemental; afinidade com cristais e metais preciosos",
    impact: "Define o perfil de mineracao da classe no sistema de trabalho de criaturas domesticadas",
  },
];

for (const { code, ...body } of patches) {
  const r = await patch(`/creature-classes/${code}`, body);
  console.log(`  ${code}: version ${r.version}`);
}

// ---------------------------------------------------------------------------
// 3. Mining rates — class affinities (3 classes × 12 items = 36 rows)
// ---------------------------------------------------------------------------

console.log("\n[3/4] Creating class mining rates...");

const classRates = await post("/mining-rates/batch", {
  items: [
    // Loricati: ambar fossil specialty, stonework, some iron
    { classCode: "CLS-001", itemCode: "ITM-001", weight: 0.25 },
    { classCode: "CLS-001", itemCode: "ITM-002", weight: 0.20 },
    { classCode: "CLS-001", itemCode: "ITM-003", weight: 0.10 },
    { classCode: "CLS-001", itemCode: "ITM-004", weight: 0.09 },
    { classCode: "CLS-001", itemCode: "ITM-005", weight: 0.03 },
    { classCode: "CLS-001", itemCode: "ITM-006", weight: 0.30 },
    { classCode: "CLS-001", itemCode: "ITM-007", weight: 0.003 },
    { classCode: "CLS-001", itemCode: "ITM-008", weight: 0.003 },
    { classCode: "CLS-001", itemCode: "ITM-009", weight: 0.003 },
    { classCode: "CLS-001", itemCode: "ITM-010", weight: 0.003 },
    { classCode: "CLS-001", itemCode: "ITM-011", weight: 0.003 },
    { classCode: "CLS-001", itemCode: "ITM-012", weight: 0.003 },
    // Theria: coal + copper specialty, underground miners
    { classCode: "CLS-002", itemCode: "ITM-001", weight: 0.15 },
    { classCode: "CLS-002", itemCode: "ITM-002", weight: 0.10 },
    { classCode: "CLS-002", itemCode: "ITM-003", weight: 0.35 },
    { classCode: "CLS-002", itemCode: "ITM-004", weight: 0.30 },
    { classCode: "CLS-002", itemCode: "ITM-005", weight: 0.04 },
    { classCode: "CLS-002", itemCode: "ITM-006", weight: 0.03 },
    { classCode: "CLS-002", itemCode: "ITM-007", weight: 0.003 },
    { classCode: "CLS-002", itemCode: "ITM-008", weight: 0.003 },
    { classCode: "CLS-002", itemCode: "ITM-009", weight: 0.003 },
    { classCode: "CLS-002", itemCode: "ITM-010", weight: 0.003 },
    { classCode: "CLS-002", itemCode: "ITM-011", weight: 0.003 },
    { classCode: "CLS-002", itemCode: "ITM-012", weight: 0.003 },
    // Draconis: elemental crystals + silver specialty
    { classCode: "CLS-003", itemCode: "ITM-001", weight: 0.10 },
    { classCode: "CLS-003", itemCode: "ITM-002", weight: 0.10 },
    { classCode: "CLS-003", itemCode: "ITM-003", weight: 0.03 },
    { classCode: "CLS-003", itemCode: "ITM-004", weight: 0.05 },
    { classCode: "CLS-003", itemCode: "ITM-005", weight: 0.20 },
    { classCode: "CLS-003", itemCode: "ITM-006", weight: 0.03 },
    { classCode: "CLS-003", itemCode: "ITM-007", weight: 0.07 },
    { classCode: "CLS-003", itemCode: "ITM-008", weight: 0.07 },
    { classCode: "CLS-003", itemCode: "ITM-009", weight: 0.07 },
    { classCode: "CLS-003", itemCode: "ITM-010", weight: 0.07 },
    { classCode: "CLS-003", itemCode: "ITM-011", weight: 0.07 },
    { classCode: "CLS-003", itemCode: "ITM-012", weight: 0.07 },
  ],
  reason: "Taxa de afinidade por tipo de minerio para cada classe: Loricati especializado em ambar fossil, Theria em carvao e cobre, Draconis em cristais elementais e prata",
  impact: "Determina a distribuicao de tipos de minerio na formula final: chance(minerio) = normalizar(peso_classe x peso_bioma)",
});
console.log(`  created ${classRates.ids.length} class rates  (version ${classRates.version})`);

// ---------------------------------------------------------------------------
// 4. Mining rates — biome BIO-001 (Mar raso)
//    Element predominante: Agua → cristal de agua com peso elevado
// ---------------------------------------------------------------------------

console.log("\n[4/4] Creating biome mining rates (BIO-001)...");

const biomeRates = await post("/mining-rates/batch", {
  items: [
    { biomeCode: "BIO-001", itemCode: "ITM-001", weight: 0.38 },
    { biomeCode: "BIO-001", itemCode: "ITM-002", weight: 0.20 },
    { biomeCode: "BIO-001", itemCode: "ITM-003", weight: 0.05 },
    { biomeCode: "BIO-001", itemCode: "ITM-004", weight: 0.15 },
    { biomeCode: "BIO-001", itemCode: "ITM-005", weight: 0.05 },
    { biomeCode: "BIO-001", itemCode: "ITM-006", weight: 0.10 },
    { biomeCode: "BIO-001", itemCode: "ITM-007", weight: 0.005 },
    { biomeCode: "BIO-001", itemCode: "ITM-008", weight: 0.040 }, // agua elevada
    { biomeCode: "BIO-001", itemCode: "ITM-009", weight: 0.005 },
    { biomeCode: "BIO-001", itemCode: "ITM-010", weight: 0.005 },
    { biomeCode: "BIO-001", itemCode: "ITM-011", weight: 0.005 },
    { biomeCode: "BIO-001", itemCode: "ITM-012", weight: 0.005 },
  ],
  reason: "Taxa de afinidade de minerio para o bioma Mar raso (BIO-001): leito rochoso favorece pedra e ferro; sedimentos preservam ambar; elemento predominante Agua eleva cristal de agua",
  impact: "Fator multiplicativo do bioma na formula final; novos biomas seguirao o mesmo padrao ao serem cadastrados",
});
console.log(`  created ${biomeRates.ids.length} biome rates  (version ${biomeRates.version})`);

console.log("\n✓ Mining module data populated successfully.");
console.log("  Next: pnpm game:export --from <api-url> --out <godot-repo-path>");
