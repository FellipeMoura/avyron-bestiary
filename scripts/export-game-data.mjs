/**
 * Build-time export: turns the bestiary into a single JSON bundle the Godot
 * project reads at startup.
 *
 *   pnpm game:export                        # from the local API
 *   pnpm game:export --from https://...     # from prod
 *   pnpm game:export --out ../my-godot-repo # override destination
 *
 * Why build-time and not a runtime API call: the game must open offline, and
 * a build has to be reproducible. The bundle carries a `dataVersion` taken
 * from the changelog, so any build can be traced back to the exact state of
 * the catalog it was cut from.
 *
 * Numeric database ids never cross this boundary. Everything is addressed by
 * the same stable codes agents use (`CRT-001`, `ELE-002`), so the bundle is
 * diffable in a pull request and survives a database rebuild.
 *
 * The export FAILS on incomplete data rather than shipping it. A creature
 * without stats would be a creature the battle system divides by zero on.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const FROM = arg("from", process.env.EXPORT_API_URL ?? "http://localhost:5101");
/**
 * Default destination is a sibling checkout — the Godot project is its own
 * git repo, per the rule that this repository is not the game.
 */
const OUT_REPO = resolve(REPO_ROOT, arg("out", process.env.GODOT_REPO ?? "../avyron"));
const OUT_FILE = resolve(OUT_REPO, "data/bestiary.json");

/**
 * Reshapes the flat `combat_rules` row into the nested block the game reads.
 *
 * The nesting exists for the consumer's sake — `rules.damage.constant` is
 * what the GDScript reads — while the table stays flat so each constant is a
 * typed, range-checked column. This function is the only place the two
 * shapes meet.
 */
function shapeRules(row, progression, relicRules) {
  return {
    /**
     * Subir de nível pede as duas coisas ao mesmo tempo: XP acumulado e
     * material da própria classe consumido. As fórmulas ficam aqui em vez de
     * em GDScript pelo mesmo motivo das constantes de dano — balancear é um
     * PATCH versionado, não um commit.
     */
    progression: {
      xp: {
        curveBase: progression.xpCurveBase,
        curveExponent: progression.xpCurveExponent,
        yieldDivisor: progression.xpYieldDivisor,
      },
      levelUpCost: {
        base: progression.itemCostBase,
        levelStep: progression.itemCostLevelStep,
      },
    },
    damage: {
      constant: row.damageConstant,
      varianceMin: row.damageVarianceMin,
      varianceMax: row.damageVarianceMax,
      minimum: row.damageMinimum,
    },
    charge: {
      max: row.chargeMax,
      takenMultiplier: row.chargeTakenMultiplier,
      dealtMultiplier: row.chargeDealtMultiplier,
      neutralCharge: row.chargeNeutralCharge,
    },
    capture: {
      minChance: row.captureMinChance,
      maxChance: row.captureMaxChance,
    },
    levels: { min: row.levelMin, max: row.levelMax },
    elementNeutralMultiplier: row.elementNeutralMultiplier,
    /**
     * Constantes globais do sistema de Relicário — floor/ceil da chance de
     * captura, os três bônus/penalidade aditivos, e o portão de nível do
     * próprio relicário (XP por captura + custo de material). Ver documento
     * `relicario`; `combat_rules.captureMinChance/maxChance` acima é da
     * fórmula antiga baseada em HP, hoje vestigial — o Relicário não lê.
     */
    relic: {
      captureFloorPct: relicRules.captureFloorPct,
      captureCeilPct: relicRules.captureCeilPct,
      sameElementBonusPct: relicRules.sameElementBonusPct,
      sameClassBonusPct: relicRules.sameClassBonusPct,
      elementDisadvantagePenaltyPct: relicRules.elementDisadvantagePenaltyPct,
      xpPerCapture: relicRules.xpPerCapture,
      xpCurveBase: relicRules.xpCurveBase,
      xpCurveExponent: relicRules.xpCurveExponent,
      materialCostBase: relicRules.materialCostBase,
      materialCostLevelStep: relicRules.materialCostLevelStep,
    },
  };
}

// ---------------------------------------------------------------------------
// fetching
// ---------------------------------------------------------------------------

async function get(path) {
  const url = `${FROM}/api/v1${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

const LIMIT = "limit=500";

console.log(`source:      ${FROM}`);

const [
  elements,
  advantages,
  classes,
  creatures,
  awakenings,
  abilities,
  abilityStats,
  creatureStats,
  captureRules,
  creatureAbilities,
  maps,
  biomes,
  mapBiomes,
  changelog,
  combatRules,
  allItems,
  itemStats,
  economyRules,
  npcs,
  npcAppearances,
  merchantOffers,
  miningRates,
  drops,
  progressionRules,
  relics,
  relicStats,
  relicRules,
] = await Promise.all([
  get(`/elements?${LIMIT}`),
  get(`/elemental-advantages?${LIMIT}`),
  get(`/creature-classes?${LIMIT}`),
  get(`/creatures?${LIMIT}`),
  get(`/awakenings?${LIMIT}`),
  get(`/abilities?${LIMIT}`),
  get(`/ability-stats?${LIMIT}`),
  get(`/creature-stats?${LIMIT}`),
  get(`/capture-rules?${LIMIT}`),
  get(`/creature-abilities?${LIMIT}`),
  get(`/maps?${LIMIT}`),
  get(`/biomes?${LIMIT}`),
  get(`/map-biomes?${LIMIT}`),
  get(`/changelog?limit=1`),
  get(`/combat-rules`),
  get(`/items?${LIMIT}`),
  get(`/item-stats?${LIMIT}`),
  get(`/economy-rules`),
  get(`/npcs?${LIMIT}`),
  get(`/npc-appearances?${LIMIT}`),
  get(`/merchant-offers?${LIMIT}`),
  get(`/mining-rates?${LIMIT}`),
  get(`/drops?${LIMIT}`),
  get(`/progression-rules`),
  get(`/relics?${LIMIT}`),
  get(`/relic-stats?${LIMIT}`),
  get(`/relic-rules`),
]);

// ---------------------------------------------------------------------------
// id → code lookups, so no numeric id reaches the bundle
// ---------------------------------------------------------------------------

const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
const elementById = byId(elements);
const classById = byId(classes);
const creatureById = byId(creatures);
const abilityById = byId(abilities);
const mapById = byId(maps);
const biomeById = byId(biomes);
const itemById = byId(allItems);
const npcById = byId(npcs);

const code = (map, id) => (id == null ? null : (map.get(id)?.code ?? null));

/**
 * Minável é o que a categoria diz, não a tabela inteira.
 *
 * Antes daqui `mining.items` recebia `GET /items` cru. Funcionava enquanto
 * todo item era minério; o primeiro item de comerciante teria sido exportado
 * como mineral. Não quebraria o jogo — sem linha em `mining_rates` ele nunca
 * seria sorteado — mas o bloco passaria a mentir sobre o que ele é, e esse é
 * o tipo de erro que ninguém encontra até muito depois.
 */
const minerals = allItems.filter((i) => i.category === "mineral");

const itemStatByItem = new Map(itemStats.map((s) => [s.itemId, s]));

const offersByNpc = new Map();
for (const offer of merchantOffers) {
  const list = offersByNpc.get(offer.npcId) ?? [];
  list.push(offer);
  offersByNpc.set(offer.npcId, list);
}

/**
 * Receita de aparência por NPC, validada contra o manifest do kit de
 * personagens — a mesma política do `modelUrl`: nome de peça que o manifest
 * não lista é link quebrado que o jogo renderizaria como buraco, então
 * aborta o export em vez de gerar bundle mentiroso. O banco não enxerga o
 * manifest (o Zod só valida forma); a validação de existência mora aqui.
 */
const CHARACTERS_MANIFEST = resolve(REPO_ROOT, "apps/web/public/models/characters/manifest.json");
const appearanceByNpc = new Map(npcAppearances.map((a) => [a.npcId, a]));

function buildAppearance(npc) {
  const a = appearanceByNpc.get(npc.id);
  if (!a) return null;
  if (!existsSync(CHARACTERS_MANIFEST)) {
    problems.push(
      `npc ${npc.code} has an appearance but the character kit manifest is missing — run pnpm models:characters`,
    );
    return null;
  }
  const kit = JSON.parse(readFileSync(CHARACTERS_MANIFEST, "utf8"));
  const hairByName = new Map(kit.hair.map((h) => [h.name, h]));
  const partsByName = new Map(kit.outfitParts.map((p) => [p.name, p]));

  for (const [field, slot] of [["hair", "hair"], ["eyebrows", "eyebrows"], ["beard", "beard"]]) {
    const value = a[field];
    if (value == null) continue;
    const entry = hairByName.get(value);
    if (!entry || entry.slot !== slot) {
      problems.push(`npc ${npc.code} appearance: ${field} '${value}' is not a ${slot} in the character kit manifest`);
    }
  }
  for (const [field, slot] of [
    ["outfitBody", "body"], ["outfitArms", "arms"], ["outfitLegs", "legs"],
    ["outfitFeet", "feet"], ["outfitHead", "head"], ["outfitAccessory", "accessory"],
  ]) {
    const value = a[field];
    if (value == null) continue;
    const entry = partsByName.get(value);
    if (!entry || entry.slot !== slot) {
      problems.push(`npc ${npc.code} appearance: ${field} '${value}' is not a ${slot} part in the character kit manifest`);
    } else if (entry.gender !== a.gender) {
      problems.push(`npc ${npc.code} appearance: ${field} '${value}' is ${entry.gender} but the npc is ${a.gender}`);
    }
  }

  // Chaves planas por slot — é o formato que a montagem no Godot consome.
  return {
    gender: a.gender,
    hair: a.hair,
    eyebrows: a.eyebrows,
    beard: a.beard,
    body: a.outfitBody,
    arms: a.outfitArms,
    legs: a.outfitLegs,
    feet: a.outfitFeet,
    head: a.outfitHead,
    accessory: a.outfitAccessory,
  };
}

const statsByCreature = byId([]);
for (const s of creatureStats) statsByCreature.set(s.creatureId, s);
const captureByCreature = new Map(captureRules.map((c) => [c.creatureId, c]));
const awakeningByCreature = new Map(awakenings.map((a) => [a.creatureId, a]));
const abilityStatByAbility = new Map(abilityStats.map((s) => [s.abilityId, s]));

const movesByCreature = new Map();
for (const link of creatureAbilities) {
  const list = movesByCreature.get(link.creatureId) ?? [];
  list.push(link);
  movesByCreature.set(link.creatureId, list);
}

/**
 * O que cada criatura larga ao ser derrotada. Vai aninhado na criatura, e não
 * como lista solta, porque o jogo consulta isso no exato momento em que já
 * tem a criatura derrotada em mãos — obrigá-lo a varrer uma tabela paralela
 * seria trabalho para nada.
 */
const dropsByCreature = new Map();
for (const drop of drops) {
  const list = dropsByCreature.get(drop.creatureId) ?? [];
  list.push(drop);
  dropsByCreature.set(drop.creatureId, list);
}

const relicStatByRelic = new Map(relicStats.map((s) => [s.relicId, s]));

// ---------------------------------------------------------------------------
// shaping + validation
// ---------------------------------------------------------------------------

const problems = [];

/**
 * Furos que não impedem o jogo de rodar, mas que ninguém escolheu de
 * propósito. Diferente de `problems`: estes não abortam, saem no fim como
 * aviso alto.
 *
 * O critério é o mesmo do jogo: contradição de dado aborta, meta de conteúdo
 * avisa. Cobertura de Despertar é meta — `docs/DATA_WORKFLOW.md` chama o
 * passo de opcional de propósito, para caber cadastrar a criatura hoje e o
 * Despertar amanhã.
 */
const warnings = [];

/**
 * Itens com preço e efeito. Um item sem linha em `item_stats` sai com valor 0
 * e efeito `none` em vez de derrubar o export: mineral recém-cadastrado ainda
 * não precificado é estado normal de trabalho, e travar a exportação inteira
 * por isso pararia o jogo por causa de um número que ninguém decidiu ainda.
 *
 * O que **não** é tolerado é item de efeito sem número — um item de captura
 * com `effectValue` 0 seria comprado, usado e não faria nada.
 */
const outItems = allItems.map((i) => {
  const s = itemStatByItem.get(i.id);
  const effectCode = s?.effectCode ?? "none";
  const effectValue = s?.effectValue ?? 0;

  if (effectCode !== "none" && effectValue <= 0) {
    problems.push(
      `item ${i.code} (${i.name}) has effectCode '${effectCode}' but effectValue ${effectValue}`,
    );
  }
  // `mineral` e `material` não passam pelo comerciante: o primeiro é minerado
  // e vendido a preço do próprio catálogo, o segundo cai em combate e só se
  // gasta na subida de nível. Exigir preço deles abortaria o export por um
  // número que, por design, é zero.
  if (!["mineral", "material"].includes(i.category) && (s?.value ?? 0) <= 0) {
    problems.push(`item ${i.code} (${i.name}) is sold but has no value in item_stats`);
  }

  return {
    code: i.code,
    name: i.name,
    category: i.category,
    // Null for everything except `material` — the class that this drop
    // belongs to (Loricati/Theria/Draconis). Lets the game ask "what does my
    // active creature's class need" directly, instead of scanning drops.
    classCode: code(classById, i.classId),
    effect: i.effect,
    notes: i.notes,
    value: s?.value ?? 0,
    effectCode,
    effectValue,
  };
});

/**
 * Modelos de Relicário, achatados com seus números — o jogo não precisa
 * saber que `relics`/`relic_stats` são duas tabelas no banco, só que um
 * modelo tem um elemento, uma classe e uma curva de captura fixas.
 */
const outRelics = relics.map((r) => {
  const s = relicStatByRelic.get(r.id);
  if (!s) problems.push(`relic ${r.code} (${r.name}) has no relic_stats row`);
  return {
    code: r.code,
    name: r.name,
    element: code(elementById, r.elementId),
    class: code(classById, r.classId),
    notes: r.notes,
    slotCapacity: s?.slotCapacity ?? 0,
    baseCaptureRate: s?.baseCaptureRate ?? 0,
    captureRatePerLevel: s?.captureRatePerLevel ?? 0,
    maxLevel: s?.maxLevel ?? 1,
  };
});

/**
 * Só quem tem papel de comerciante, com o catálogo já resolvido em códigos.
 * O jogo não deve precisar cruzar duas listas para desenhar uma loja.
 */
const outMerchants = npcs
  .filter((n) => n.role === "merchant")
  .map((n) => {
    const offers = (offersByNpc.get(n.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    if (offers.length === 0) {
      problems.push(`npc ${n.code} (${n.name}) is a merchant with no merchant_offers`);
    }
    return {
      code: n.code,
      name: n.name,
      faction: n.faction,
      map: code(mapById, n.mapId),
      notes: n.notes,
      appearance: buildAppearance(n),
      offers: offers.map((o) => ({
        itemCode: code(itemById, o.itemId),
        // Preço já resolvido: null no banco significa "cobra o base", e
        // decidir isso aqui evita o jogo reimplementar a mesma regra.
        price: o.price ?? itemStatByItem.get(o.itemId)?.value ?? 0,
      })),
    };
  });

/**
 * Só quem tem papel de duelista — o NPC de arena (documento
 * `glifos-e-portais`). Identidade e posicionamento do catálogo; qual
 * criatura o duelista usa e qual Glifo ele concede ficam de propósito fora
 * daqui, como decisão de conteúdo do jogo (mesmo nível que `starter_code`
 * já é em `WorldRoot`) — o catálogo não tem coluna pra isso e não precisa.
 */
const outDuelists = npcs
  .filter((n) => n.role === "duelist")
  .map((n) => ({
    code: n.code,
    name: n.name,
    faction: n.faction,
    map: code(mapById, n.mapId),
    notes: n.notes,
    appearance: buildAppearance(n),
  }));

const outAbilities = abilities.map((a) => {
  const s = abilityStatByAbility.get(a.id);
  if (!s) problems.push(`ability ${a.code} (${a.name}) has no ability_stats row`);
  return {
    code: a.code,
    name: a.name,
    element: code(elementById, a.elementId),
    type: a.type,
    effect: a.effect,
    awakeningOnly: a.awakeningOnly,
    power: s?.power ?? 0,
    accuracy: s?.accuracy ?? 100,
    uses: s?.uses ?? 10,
    priority: s?.priority ?? 0,
    effectCode: s?.effectCode ?? "damage",
    effectValue: s?.effectValue ?? 0,
    targetSelf: s?.targetSelf ?? false,
  };
});

const outCreatures = creatures.map((c) => {
  const s = statsByCreature.get(c.id);
  const cap = captureByCreature.get(c.id);
  const awk = awakeningByCreature.get(c.id);
  const moves = (movesByCreature.get(c.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

  if (!s) problems.push(`creature ${c.code} (${c.originalName}) has no creature_stats row`);
  if (!cap) problems.push(`creature ${c.code} (${c.originalName}) has no capture_rules row`);
  if (moves.length === 0) problems.push(`creature ${c.code} (${c.originalName}) knows no abilities`);

  // Golpe de assinatura sem Despertar é um golpe que o jogador vê na ficha e
  // nunca consegue usar: `Combatant` filtra `awakeningOnly` por
  // `is_awakened`, e sem linha em `awakenings` a criatura não desperta nunca.
  // Foi assim que `CRT-013` jogou com 5 golpes contra 6 do resto do elenco
  // sem nada acusar — o export não olhava, e `test_data.gd` só reclamava da
  // cobertura 1:1, que é outra coisa.
  if (!awk) {
    const signature = moves
      .map((m) => abilityById.get(m.abilityId))
      .filter((a) => a?.awakeningOnly);
    for (const a of signature) {
      problems.push(
        `creature ${c.code} (${c.originalName}) has no awakening but knows ${a.code} (${a.name}), `
          + `which is awakeningOnly — the move would be permanently unusable`,
      );
    }
    // A cobertura em si é meta, não invariante: sem Despertar a criatura
    // ainda joga, só não usa o medidor de carga. Avisa e segue.
    warnings.push(`creature ${c.code} (${c.originalName}) has no awakening — 1:1 coverage broken`);
  }
  // Sem tamanho o jogo não tem como instanciar a criatura. Se a origem for um
  // deploy antigo, o campo chega `undefined`, o JSON.stringify o descarta e o
  // bundle sairia silenciosamente sem escala — falhar aqui é o ponto.
  if (s && typeof s.sizeMeters !== "number") {
    problems.push(
      `creature ${c.code} (${c.originalName}) has no sizeMeters — is the source running an older deploy?`,
    );
  }

  return {
    code: c.code,
    name: c.originalName,
    baseSpecies: c.baseSpecies,
    class: code(classById, c.classId),
    element: code(elementById, c.elementId),
    map: code(mapById, c.mapId),
    silhouetteNote: c.silhouetteNote,
    modelUrl: c.modelUrl,
    stats: s
      ? {
          hp: s.baseHp,
          attack: s.baseAttack,
          defense: s.baseDefense,
          speed: s.baseSpeed,
          charge: s.baseCharge,
          growthRate: s.growthRate,
          // Quanto esta espécie concede ao ser derrotada. A conta do XP
          // ganho fica no jogo; o divisor vem de `rules.progression.xp`.
          xpYield: s.xpYield,
          // Escala dramatizada, em unidades Godot. O tamanho real fica de
          // fora do bundle: é editorial, e o jogo não tem o que fazer com ele.
          sizeMeters: s.sizeMeters,
          awakeningMultiplier: s.awakeningMultiplier,
          awakeningDurationTurns: s.awakeningDurationTurns,
        }
      : null,
    capture: cap ? { catchRate: cap.catchRate, awakenedMultiplier: cap.awakenedMultiplier } : null,
    abilities: moves.map((m) => ({
      code: code(abilityById, m.abilityId),
      learnLevel: m.learnLevel,
    })),
    drops: (dropsByCreature.get(c.id) ?? []).map((d) => {
      const droppedItem = itemById.get(d.itemId);
      // A ligação classe → material que `items.classId` agora torna explícita
      // só vale alguma coisa se os 26 `drops` concordarem com ela. Sem esta
      // checagem, uma linha de drop errada (item da classe errada) passaria
      // batido: nada mais no schema garante a correspondência.
      if (droppedItem?.category === "material" && droppedItem.classId != null
          && droppedItem.classId !== c.classId) {
        problems.push(
          `creature ${c.code} (${c.originalName}, class ${code(classById, c.classId)}) `
            + `drops ${droppedItem.code} (${droppedItem.name}), which belongs to class `
            + `${code(classById, droppedItem.classId)} — drop must match the item's own class`,
        );
      }
      return {
        itemCode: code(itemById, d.itemId),
        chance: d.chance,
        condition: d.condition,
      };
    }),
    awakening: awk
      ? {
          code: awk.code,
          name: awk.name,
          type: awk.type,
          referenceSpecies: awk.referenceSpecies,
        }
      : null,
  };
});

/**
 * Paleta do elemento: rampa de três paradas lida por LUMINÂNCIA no jogo, mais
 * a cor da aura do Despertar Ancestral e a dispersão permitida dentro da
 * família. Ver o comentário de `packages/db/src/schema/elements.ts` sobre por
 * que isto é rampa e não conjunto de cores soltas.
 *
 * A divisão entre abortar e avisar segue o critério da casa:
 *
 *  - elemento **sem paleta nenhuma** avisa. O jogo cai no corpo neutro e
 *    continua jogável — é meta de conteúdo, como cobertura de Despertar.
 *  - elemento com paleta **pela metade** aborta. Rampa sem uma das paradas
 *    não é rampa: o jogo teria de inventar a cor que falta, e o resultado
 *    seria uma criatura errada em silêncio, que é a classe de furo que o
 *    `CRT-013` custou caro para ensinar.
 *  - hex malformado aborta. A API valida na escrita, mas um snapshot
 *    restaurado de outra máquina não passou por ela.
 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function shapeElementPalette(e) {
  const stops = {
    shadow: e.paletteShadow,
    mid: e.paletteMid,
    highlight: e.paletteHighlight,
  };
  const filled = Object.entries(stops).filter(([, v]) => v != null);

  if (filled.length === 0) {
    warnings.push(
      `element ${e.code} (${e.name}) has no palette — creatures of this element fall back to the neutral body`,
    );
    return null;
  }
  if (filled.length < 3) {
    const missing = Object.entries(stops)
      .filter(([, v]) => v == null)
      .map(([k]) => k);
    problems.push(
      `element ${e.code} (${e.name}) has a partial palette — missing ${missing.join(", ")}`,
    );
    return null;
  }

  // `aura` cai para o highlight quando não autorada. Ver o comentário da
  // coluna: o fallback é o comportamento seguro, não o desejável.
  const aura = e.paletteAura ?? e.paletteHighlight;
  for (const [field, value] of [...filled, ["aura", aura]]) {
    if (!HEX_COLOR.test(value)) {
      problems.push(`element ${e.code} (${e.name}) palette ${field} '${value}' is not #RRGGBB`);
      return null;
    }
  }

  return {
    shadow: stops.shadow,
    mid: stops.mid,
    highlight: stops.highlight,
    aura,
    spread: e.paletteSpread ?? 0,
  };
}

// ---------------------------------------------------------------------------
// biomas do mapa
// ---------------------------------------------------------------------------

/** mapId -> [códigos de bioma], na ordem de `sortOrder`. */
const biomeCodesByMap = new Map();
for (const link of [...mapBiomes].sort((a, b) => a.sortOrder - b.sortOrder)) {
  const biomeCode = code(biomeById, link.biomeId);
  if (biomeCode == null) continue;
  const list = biomeCodesByMap.get(link.mapId) ?? [];
  list.push(biomeCode);
  biomeCodesByMap.set(link.mapId, list);
}

/**
 * O documento `mineracao` manda: "cada novo BIO-* precisa de suas 12 taxas".
 * Bioma de mapa sem taxa nenhuma não quebra o jogo — `MiningTable` trata lado
 * ausente como neutro (×1) e a mineração vira só classe. É justamente por ser
 * silencioso que precisa aparecer: a dimensão some da fórmula sem ninguém ver.
 *
 * Avisa em vez de abortar, mesma política de dois níveis da cobertura de
 * Despertar: é alvo de conteúdo por preencher, não contradição de dado.
 */
const biomesWithRates = new Set(
  miningRates.filter((r) => r.biomeId != null).map((r) => r.biomeId),
);
for (const [mapId, codes] of biomeCodesByMap) {
  const mapCode = code(mapById, mapId);
  for (const biomeCode of codes) {
    const biome = biomes.find((b) => b.code === biomeCode);
    if (biome && !biomesWithRates.has(biome.id)) {
      warnings.push(
        `biome ${biome.code} (${biome.name}) is on map ${mapCode} but has no mining_rates — `
          + "mining there falls back to class-only, silently",
      );
    }
  }
}

const bundle = {
  dataVersion: changelog[0]?.version ?? "0.00",
  generatedAt: new Date().toISOString(),
  source: FROM,
  rules: shapeRules(combatRules, progressionRules, relicRules),
  elements: elements.map((e) => ({
    code: e.code,
    name: e.name,
    palette: shapeElementPalette(e),
  })),
  elementalAdvantages: advantages.map((a) => ({
    attacker: code(elementById, a.attackerElementId),
    defender: code(elementById, a.defenderElementId),
    multiplier: a.multiplier,
  })),
  classes: classes.map((c) => ({
    code: c.code,
    name: c.name,
    biologicalScope: c.biologicalScope,
    workFunction: c.workFunction ? JSON.parse(c.workFunction) : null,
  })),
  maps: maps.map((m) => ({
    code: m.code,
    name: m.name,
    era: m.era,
    sortOrder: m.sortOrder,
    /**
     * Os biomas do mapa, na ordem de `sortOrder` da junção. O jogo ainda usa
     * um bioma só por mapa (`WorldRoot.DEFAULT_BIOME`) porque o mundo não tem
     * noção espacial de bioma — mas precisa desta lista para **conferir** que
     * o bioma que ele declara pertence ao mapa. Sem isso a checagem não teria
     * contra o que comparar, e o `map_biomes` seguiria sendo um módulo de API
     * que ninguém consome.
     */
    biomes: biomeCodesByMap.get(m.id) ?? [],
  })),
  biomes: biomes.map((b) => ({
    code: b.code,
    name: b.name,
    predominantElements: b.predominantElements,
  })),
  abilities: outAbilities,
  creatures: outCreatures,
  /**
   * Todo item do catálogo, com os números que o jogo executa. `mining.items`
   * continua existindo como a fatia minerável — o jogo lê preço e efeito
   * daqui, e sorteio de picareta de lá.
   */
  items: outItems,
  relics: outRelics,
  economy: {
    currencyName: economyRules.currencyName,
    currencyNamePlural: economyRules.currencyNamePlural,
    startingCurrency: economyRules.startingCurrency,
    sellRatio: economyRules.sellRatio,
  },
  merchants: outMerchants,
  duelists: outDuelists,
  mining: {
    items: minerals.map((i) => ({
      code: i.code,
      name: i.name,
      category: i.category,
      effect: i.effect,
      notes: i.notes,
    })),
    rates: miningRates.map((r) => ({
      classCode: code(classById, r.classId),
      biomeCode: code(biomeById, r.biomeId),
      itemCode: code(itemById, r.itemId),
      weight: r.weight,
    })),
  },
};

// ---------------------------------------------------------------------------
// mineração — os três furos que `test_data.gd` já pegava e o export não
//
// Nenhum derruba o jogo: sem pesos a classe minera pelo bioma puro, sem perfil
// o ritmo cai no neutro, e um peso órfão some na normalização. É justamente
// por isso que precisam abortar aqui — os três transformam um número que o
// designer escreveu em nada, silenciosamente, e o sintoma ("a mineração da
// Theria parece igual à da Draconis") não aponta para a causa.
// ---------------------------------------------------------------------------

const mineralIds = new Set(minerals.map((i) => i.id));

// Peso apontando para item que não é `mineral`: a linha viaja em
// `mining.rates`, mas o item não entra em `mining.items`, e o jogo distribui
// um peso sobre um código que não existe do lado dele. A FK do banco não
// cobre — ela garante que o item existe, não que ele seja minerável.
for (const r of miningRates) {
  if (!mineralIds.has(r.itemId)) {
    const item = itemById.get(r.itemId);
    problems.push(
      `mining rate for ${code(classById, r.classId) ?? code(biomeById, r.biomeId)} points at `
        + `${item?.code ?? `item ${r.itemId}`} (${item?.name ?? "?"}), whose category is `
        + `'${item?.category ?? "?"}' and not 'mineral' — the weight would be exported into a void`,
    );
  }
}

// Toda classe com criatura no elenco precisa de pesos e de perfil de
// trabalho. O elenco é fechado em 3 classes, então isto não é um gate que
// aperta com o tempo — é o que garante que classe nova não entre muda.
const castClassIds = new Set(creatures.map((c) => c.classId));
const ratesByClass = new Set(miningRates.filter((r) => r.classId != null).map((r) => r.classId));

for (const cls of classes) {
  if (!castClassIds.has(cls.id)) continue;
  if (!ratesByClass.has(cls.id)) {
    problems.push(
      `class ${cls.code} (${cls.name}) has creatures in the cast but no mining_rates — `
        + `its creatures would mine by biome only, and the work profile would be decoration`,
    );
  }
  if (!cls.workFunction) {
    problems.push(
      `class ${cls.code} (${cls.name}) has creatures in the cast but no workFunction — `
        + `mining speed falls back to neutral and the role label comes out empty`,
    );
  }
}

// ---------------------------------------------------------------------------
// models
// ---------------------------------------------------------------------------

/**
 * The bundle carries `modelUrl` as a string, but the game can't fetch it —
 * it must open offline, same reason the bundle exists at all. So the export
 * mirrors every referenced .glb into `<godot>/models/`, preserving the URL
 * path (`/models/placeholders/big/Orc.glb` → `models/placeholders/big/Orc.glb`,
 * read by the game as `res://models/...`). Placeholders are N:1 — many
 * creatures share one file — so the set is deduplicated first.
 *
 * A modelUrl pointing at a file that doesn't exist is a broken link the game
 * would silently render as a capsule; it aborts the export like any other
 * incomplete record.
 */
const WEB_MODELS_DIR = resolve(REPO_ROOT, "apps/web/public/models");
const MODEL_URL_PREFIX = "/models/";

const modelUrls = [...new Set(creatures.map((c) => c.modelUrl).filter(Boolean))];
const modelCopies = [];
for (const url of modelUrls) {
  if (!url.startsWith(MODEL_URL_PREFIX)) {
    problems.push(`modelUrl '${url}' does not start with ${MODEL_URL_PREFIX} — cannot be mirrored to the game repo`);
    continue;
  }
  const rel = url.slice(MODEL_URL_PREFIX.length);
  const src = resolve(WEB_MODELS_DIR, rel);
  if (!existsSync(src)) {
    problems.push(`modelUrl '${url}' points at a missing file (${src})`);
    continue;
  }
  modelCopies.push({ src, dest: resolve(OUT_REPO, "models", rel) });
}

/**
 * Props de bioma são espelhados por DIRETÓRIO, não por referência: nenhuma
 * criatura aponta para eles, quem os consome é a cena do mapa no Godot. Vai
 * tudo que `pnpm models:biomes` gerou — .gltf, .bin e as texturas
 * compartilhadas, que precisam viajar juntas para as URIs relativas
 * continuarem válidas.
 */
const BIOMES_DIR = resolve(WEB_MODELS_DIR, "biomes");

/**
 * O kit de personagens (corpos, cabelos, peças de outfit, bibliotecas de
 * animação — `pnpm models:characters`) segue o mesmo contrato dos biomas:
 * espelhado por diretório inteiro, .gltf + .bin + texturas compartilhadas
 * viajando juntos para as URIs relativas continuarem válidas.
 */
const CHARACTERS_DIR = resolve(WEB_MODELS_DIR, "characters");

function mirrorDir(srcDir, destDir) {
  let copies = 0;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);
    if (entry.isDirectory()) {
      copies += mirrorDir(src, dest);
    } else {
      mkdirSync(destDir, { recursive: true });
      copyFileSync(src, dest);
      copies += 1;
    }
  }
  return copies;
}

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

if (problems.length > 0) {
  console.error(`\nexport aborted — ${problems.length} incomplete record(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nFix the data through the API, then re-run. Nothing was written.");
  process.exit(1);
}

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

// Depois da escrita, de propósito: aviso não bloqueia, mas fica como a última
// coisa antes do resumo, onde não passa despercebido.
if (warnings.length > 0) {
  console.warn(`\nexport warnings — ${warnings.length} (bundle written anyway):`);
  for (const w of warnings) console.warn(`  ! ${w}`);
  console.warn("");
}

for (const { src, dest } of modelCopies) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

const biomeCopies = existsSync(BIOMES_DIR)
  ? mirrorDir(BIOMES_DIR, resolve(OUT_REPO, "models/biomes"))
  : 0;
const characterCopies = existsSync(CHARACTERS_DIR)
  ? mirrorDir(CHARACTERS_DIR, resolve(OUT_REPO, "models/characters"))
  : 0;

const kb = (Buffer.byteLength(JSON.stringify(bundle)) / 1024).toFixed(1);
console.log(`dataVersion: ${bundle.dataVersion}`);
console.log(`written:     ${OUT_FILE} (${kb} KB)`);
console.log(`models:      ${modelCopies.length} .glb mirrored to ${resolve(OUT_REPO, "models")}`);
console.log(`biomes:      ${biomeCopies} files mirrored to ${resolve(OUT_REPO, "models/biomes")}`);
console.log(`characters:  ${characterCopies} files mirrored to ${resolve(OUT_REPO, "models/characters")}`);
console.log(
  `contents:    ${bundle.creatures.length} creatures, ${bundle.abilities.length} abilities, ` +
    `${bundle.elementalAdvantages.length} elemental pairs, ${bundle.classes.length} classes, ` +
    `${bundle.relics.length} relics`,
);
