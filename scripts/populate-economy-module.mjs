/**
 * One-shot script: populates the economy module on a running API.
 *
 *   pnpm dev                                    # a API precisa estar de pé
 *   node scripts/populate-economy-module.mjs
 *
 * Já foi executado — o conteúdo vive em `packages/db/snapshot/` e volta com
 * `pnpm db:restore`. Fica no repositório como registro de quais números
 * entraram e por quê; para uma máquina nova, use o restore, não isto.
 *
 * Safe to re-run: item codes are unique (409 on the second run, handled), and
 * item-stats / merchant-offers use upsert semantics. Running twice leaves the
 * same state.
 */

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg("api", process.env.EXPORT_API_URL ?? "http://localhost:5101") + "/api/v1";
const KEY = arg("key", process.env.PROD_API_KEY ?? process.env.API_KEY ?? "change-me-before-running");

async function send(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  // 409 = já existe. Este script é idempotente por desenho, e um código
  // duplicado na segunda execução é o resultado esperado, não uma falha.
  if (res.status === 409) {
    console.log(`  (ja existe) ${method} ${path}`);
    return json;
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const post = (path, body) => send("POST", path, body);

console.log(`target: ${BASE}`);

// ---------------------------------------------------------------------------
// 1. Consumíveis
//
// Resina é o tema de captura: prender a criatura em resina que endurece em
// âmbar é o gesto que o cenário paleontológico pedia, e conversa com o mineral
// "Âmbar Fóssil" que a mineração já produzia. Emplastro e seiva cobrem a cura,
// que só passou a importar quando o HP virou persistente entre batalhas.
// ---------------------------------------------------------------------------

console.log("-- itens de consumo");
await post("/items/batch", {
  items: [
    { code: "ITM-013", name: "Resina Comum", category: "capture", effect: "Aumenta a chance de captura em metade.", acquisition: "Comerciante" },
    { code: "ITM-014", name: "Resina Densa", category: "capture", effect: "Aumenta bastante a chance de captura.", acquisition: "Comerciante" },
    { code: "ITM-015", name: "Resina Ancestral", category: "capture", effect: "Quadruplica a chance de captura.", acquisition: "Comerciante" },
    { code: "ITM-016", name: "Emplastro de Limo", category: "heal", effect: "Recupera parte do vigor da criatura.", acquisition: "Comerciante" },
    { code: "ITM-017", name: "Emplastro Espesso", category: "heal", effect: "Recupera boa parte do vigor da criatura.", acquisition: "Comerciante" },
    { code: "ITM-018", name: "Seiva Primordial", category: "heal", effect: "Restaura o vigor por completo.", acquisition: "Comerciante" },
  ],
  reason: "Primeiros itens nao-minerais: o comerciante precisa de algo para vender, e a mineracao nao tinha nenhum escoadouro",
  impact: "Fecha o laco da economia; captura e cura passam a ter custo em obolos",
});

// ---------------------------------------------------------------------------
// 2. Números
//
// Preço de mineral segue a raridade agregada em mining_rates. O piso de 5 na
// Pedra não é estético: com sellRatio 0.4, valor 2 venderia por floor(0.8) = 0,
// e um item que não vale nada polui o inventário sem nunca sair dele.
//
// Consumíveis calibrados contra a renda de mineração — no PZ-01 com Loricati
// a distribuição rende ~12 óbolos de valor por minério, ~5 de venda, e a
// picareta sai a cada 3 s: da ordem de 98 óbolos por minuto.
// ---------------------------------------------------------------------------

console.log("-- precos e efeitos");
await post("/item-stats/batch", {
  items: [
    { itemCode: "ITM-001", value: 5, effectCode: "none" },     // Pedra
    { itemCode: "ITM-002", value: 12, effectCode: "none" },    // Ferro
    { itemCode: "ITM-003", value: 14, effectCode: "none" },    // Carvao
    { itemCode: "ITM-004", value: 20, effectCode: "none" },    // Cobre
    { itemCode: "ITM-005", value: 60, effectCode: "none" },    // Prata
    { itemCode: "ITM-006", value: 30, effectCode: "none" },    // Ambar Fossil
    { itemCode: "ITM-007", value: 150, effectCode: "none" },   // Cristal Fogo
    { itemCode: "ITM-008", value: 150, effectCode: "none" },   // Cristal Agua
    { itemCode: "ITM-009", value: 150, effectCode: "none" },   // Cristal Natureza
    { itemCode: "ITM-010", value: 150, effectCode: "none" },   // Cristal Terra
    { itemCode: "ITM-011", value: 150, effectCode: "none" },   // Cristal Eletricidade
    { itemCode: "ITM-012", value: 150, effectCode: "none" },   // Cristal Gelo

    { itemCode: "ITM-013", value: 60, effectCode: "capture_bonus", effectValue: 1.5 },
    { itemCode: "ITM-014", value: 180, effectCode: "capture_bonus", effectValue: 2.5 },
    { itemCode: "ITM-015", value: 500, effectCode: "capture_bonus", effectValue: 4.0 },
    { itemCode: "ITM-016", value: 80, effectCode: "heal_percent", effectValue: 30 },
    { itemCode: "ITM-017", value: 220, effectCode: "heal_percent", effectValue: 70 },
    { itemCode: "ITM-018", value: 600, effectCode: "heal_percent", effectValue: 100 },
  ],
  reason: "Precos de mineral escalonados pela raridade agregada em mining_rates; consumiveis calibrados contra ~98 obolos/min de mineracao no PZ-01 com Loricati",
  impact: "Resina Comum custa ~40s de mineracao, Ancestral ~5min; define o ritmo de progressao economica",
});

// ---------------------------------------------------------------------------
// 3. O comerciante
// ---------------------------------------------------------------------------

console.log("-- comerciante");
await post("/npcs", {
  code: "NPC-001",
  name: "Curador Sarn",
  faction: "Guilda dos Curadores",
  mapCode: "PZ-01",
  role: "merchant",
  notes: "Trata dos achados e de quem os traz. Compra mineral bruto, vende resina de captura e emplastro.",
  reason: "Primeiro NPC do jogo; a mineracao produzia 12 minerais sem nenhum comprador",
  impact: "Abre o laco de economia no PZ-01 e estabelece o papel merchant como gatilho de tela",
});

console.log("-- catalogo do comerciante");
await post("/merchant-offers/batch", {
  items: [
    { npcCode: "NPC-001", itemCode: "ITM-013", sortOrder: 0 },
    { npcCode: "NPC-001", itemCode: "ITM-014", sortOrder: 1 },
    { npcCode: "NPC-001", itemCode: "ITM-015", sortOrder: 2 },
    { npcCode: "NPC-001", itemCode: "ITM-016", sortOrder: 3 },
    { npcCode: "NPC-001", itemCode: "ITM-017", sortOrder: 4 },
    { npcCode: "NPC-001", itemCode: "ITM-018", sortOrder: 5 },
  ],
  reason: "Catalogo inicial do Curador Sarn: as tres resinas e os tres emplastros, sem sobrepreco",
  impact: "Preco nulo cobra item_stats.value; um segundo comerciante caro sera dado, nao codigo",
});

// `economy_rules` nao precisa de escrita: o servico cria a linha unica com os
// defaults do schema no primeiro GET. Ajustar moeda ou margem depois e um
// PATCH, como qualquer outro tuning.

console.log("pronto");
