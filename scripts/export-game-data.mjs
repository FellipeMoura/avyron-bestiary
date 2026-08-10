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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  changelog,
  combatRules,
  allItems,
  itemStats,
  economyRules,
  npcs,
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
  get(`/changelog?limit=1`),
  get(`/combat-rules`),
  get(`/items?${LIMIT}`),
  get(`/item-stats?${LIMIT}`),
  get(`/economy-rules`),
  get(`/npcs?${LIMIT}`),
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
 * modelo tem um elemento, uma classe e uma curva de captura/buff fixas.
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
    combatBuffBase: s?.combatBuffBase ?? 0,
    combatBuffPerLevel: s?.combatBuffPerLevel ?? 0,
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
      offers: offers.map((o) => ({
        itemCode: code(itemById, o.itemId),
        // Preço já resolvido: null no banco significa "cobra o base", e
        // decidir isso aqui evita o jogo reimplementar a mesma regra.
        price: o.price ?? itemStatByItem.get(o.itemId)?.value ?? 0,
      })),
    };
  });

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
    biome: code(biomeById, c.biomeId),
    role: c.role,
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

const bundle = {
  dataVersion: changelog[0]?.version ?? "0.00",
  generatedAt: new Date().toISOString(),
  source: FROM,
  rules: shapeRules(combatRules, progressionRules, relicRules),
  elements: elements.map((e) => ({ code: e.code, name: e.name })),
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
  maps: maps.map((m) => ({ code: m.code, name: m.name, era: m.era, sortOrder: m.sortOrder })),
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

const kb = (Buffer.byteLength(JSON.stringify(bundle)) / 1024).toFixed(1);
console.log(`dataVersion: ${bundle.dataVersion}`);
console.log(`written:     ${OUT_FILE} (${kb} KB)`);
console.log(
  `contents:    ${bundle.creatures.length} creatures, ${bundle.abilities.length} abilities, ` +
    `${bundle.elementalAdvantages.length} elemental pairs, ${bundle.classes.length} classes, ` +
    `${bundle.relics.length} relics`,
);
