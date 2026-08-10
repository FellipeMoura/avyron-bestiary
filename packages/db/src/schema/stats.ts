import { boolean, check, integer, pgTable, real, serial, text, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { abilityEffectEnum, itemEffectEnum } from "./enums";
import { abilities, items } from "./gameplay";
import { creatures } from "./creatures";
import { timestamps } from "./timestamps";

/**
 * The numbers layer. Everything the Godot build needs to actually *run* a
 * turn-based battle, kept separate from the editorial catalog so the
 * bestiary tables stay descriptive and these stay tunable.
 *
 * As tabelas:
 *   creature_stats   — 1:1 with creatures, base values + growth curve
 *   ability_stats    — 1:1 with abilities, the executable move numbers
 *   capture_rules    — 1:1 with creatures, capture difficulty
 *   creature_abilities — junction; which creature knows which move, at what level
 *   combat_rules     — singleton, as constantes de dano/carga/captura
 *   item_stats       — 1:1 with items, preço e efeito executável
 *   economy_rules    — singleton, moeda e margem do comerciante
 *   progression_rules — singleton, curva de XP e custo de material do level-up
 *
 * `elemental_advantages` já existia como tabela e só precisava de dados.
 *
 * A contagem não é regra: quando um sistema novo pediu números — mineração,
 * economia —, a camada cresceu. O que é regra é que número de tuning não mora
 * em código.
 */

/**
 * Base values are the stat at level 1. The effective value at any level is
 *
 *     valor(nivel) = floor(base * (1 + growthRate * (nivel - 1)))
 *
 * A single `growthRate` scales every stat of the creature — one knob per
 * species instead of five. Typical range 0.02 (lento) to 0.05 (rapido);
 * at nivel 50 that spans base x1.98 to base x3.45.
 *
 * `baseCharge` feeds the Despertar Ancestral meter — see the
 * `carga-e-despertar` design document for the fill formula. It is a stat
 * like any other and scales with the same curve.
 */
export const creatureStats = pgTable(
  "creature_stats",
  {
    id: serial("id").primaryKey(),
    creatureId: integer("creature_id")
      .notNull()
      .unique()
      .references(() => creatures.id, { onDelete: "cascade" }),
    baseHp: integer("base_hp").notNull(),
    baseAttack: integer("base_attack").notNull(),
    baseDefense: integer("base_defense").notNull(),
    baseSpeed: integer("base_speed").notNull(),
    baseCharge: integer("base_charge").notNull(),
    growthRate: real("growth_rate").notNull().default(0.03),

    /**
     * Maior dimensão da criatura em unidades Godot (1 unidade = 1 metro),
     * já na **escala dramatizada** que o jogo usa — não o tamanho real.
     *
     * O jogador tem 1.8 m. O piso é 0.9 (metade dele) e o teto 4.5 (duas
     * vezes e meia). Proporção real entre as espécies seria ilegível: um
     * trilobita de 10 cm ao lado de um Cotylorhynchus de 6 m ficaria
     * invisível, e um saurópode de 35 m não caberia no enquadramento
     * isométrico. A curva de compressão está no documento `escala-das-criaturas`.
     */
    sizeMeters: real("size_meters").notNull().default(1.8),

    /**
     * Tamanho paleontológico real, em metros. Editorial — o jogo não lê.
     * Serve para a ficha do bestiário e para recalcular `sizeMeters` se a
     * curva de compressão mudar, sem precisar pesquisar tudo de novo.
     */
    realSizeMeters: real("real_size_meters"),
    /**
     * Quanto esta espécie vale ao ser derrotada. A criatura vencedora ganha
     *
     *     floor(xpYield * nivelDoDerrotado / progression_rules.xpYieldDivisor)
     *
     * Fica aqui, e não em `progression_rules`, porque é valor por espécie e
     * não constante de tuning: um chefe lento e resistente vale mais que um
     * inicial. A convenção do elenco é derivá-lo da soma dos cinco stats base
     * dividida por 5, o que hoje dá a faixa 40–90.
     */
    xpYield: integer("xp_yield").notNull().default(60),

    /** Multiplier applied to attack and defense while the Despertar is active. */
    awakeningMultiplier: real("awakening_multiplier").notNull().default(1.5),
    awakeningDurationTurns: integer("awakening_duration_turns").notNull().default(3),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    hpRange: check("creature_stats_hp_range", sql`${t.baseHp} > 0 AND ${t.baseHp} <= 999`),
    attackRange: check("creature_stats_attack_range", sql`${t.baseAttack} > 0 AND ${t.baseAttack} <= 999`),
    defenseRange: check("creature_stats_defense_range", sql`${t.baseDefense} > 0 AND ${t.baseDefense} <= 999`),
    speedRange: check("creature_stats_speed_range", sql`${t.baseSpeed} > 0 AND ${t.baseSpeed} <= 999`),
    chargeRange: check("creature_stats_charge_range", sql`${t.baseCharge} > 0 AND ${t.baseCharge} <= 999`),
    growthRange: check("creature_stats_growth_range", sql`${t.growthRate} > 0 AND ${t.growthRate} <= 0.2`),
    xpYieldRange: check("creature_stats_xp_yield_range", sql`${t.xpYield} > 0 AND ${t.xpYield} <= 500`),
    /**
     * Os literais são convertidos para `real` de propósito. A coluna é float4
     * e o literal cru seria float8: 0.9 armazenado como float4 vale
     * 0.89999997615814208984375, que é MENOR que o 0.9 em dupla precisão — e
     * o CHECK rejeitaria o próprio valor de piso. Comparar nos dois lados no
     * mesmo tipo elimina isso.
     */
    sizeRange: check(
      "creature_stats_size_range",
      sql`${t.sizeMeters} >= 0.9::real AND ${t.sizeMeters} <= 4.5::real`,
    ),
    realSizeRange: check(
      "creature_stats_real_size_range",
      sql`${t.realSizeMeters} IS NULL OR (${t.realSizeMeters} > 0 AND ${t.realSizeMeters} <= 100)`,
    ),
    durationRange: check(
      "creature_stats_duration_range",
      sql`${t.awakeningDurationTurns} >= 1 AND ${t.awakeningDurationTurns} <= 10`,
    ),
  }),
);

/**
 * The executable half of an ability. `abilities.effect` stays as prose for
 * humans; these are the numbers the battle system reads.
 *
 * `power` 0 means the move deals no direct damage — it is a status move and
 * its work happens through `effectCode` / `effectValue`.
 */
export const abilityStats = pgTable(
  "ability_stats",
  {
    id: serial("id").primaryKey(),
    abilityId: integer("ability_id")
      .notNull()
      .unique()
      .references(() => abilities.id, { onDelete: "cascade" }),
    power: integer("power").notNull().default(0),
    accuracy: integer("accuracy").notNull().default(100),
    /** Times the move can be used per rest. PP by another name. */
    uses: integer("uses").notNull().default(15),
    /** Higher goes first regardless of speed. 0 is normal. */
    priority: integer("priority").notNull().default(0),
    effectCode: abilityEffectEnum("effect_code").notNull().default("damage"),
    /** Magnitude of the effect: percent for buffs/debuffs, flat for heal/charge. */
    effectValue: integer("effect_value").notNull().default(0),
    targetSelf: boolean("target_self").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    powerRange: check("ability_stats_power_range", sql`${t.power} >= 0 AND ${t.power} <= 250`),
    accuracyRange: check("ability_stats_accuracy_range", sql`${t.accuracy} >= 1 AND ${t.accuracy} <= 100`),
    usesRange: check("ability_stats_uses_range", sql`${t.uses} >= 1 AND ${t.uses} <= 40`),
    priorityRange: check("ability_stats_priority_range", sql`${t.priority} >= -3 AND ${t.priority} <= 3`),
  }),
);

/**
 * Capture difficulty, 1:1 with a creature. `catchRate` follows the familiar
 * 1–255 convention (higher = easier) so the numbers read intuitively to
 * anyone who has balanced a collection game.
 *
 * `awakenedMultiplier` answers the open question in the `captura` document:
 * yes, a wild creature in Despertar Ancestral is harder to capture. Below 1
 * makes it harder; the default halves the odds.
 */
export const captureRules = pgTable(
  "capture_rules",
  {
    id: serial("id").primaryKey(),
    creatureId: integer("creature_id")
      .notNull()
      .unique()
      .references(() => creatures.id, { onDelete: "cascade" }),
    catchRate: integer("catch_rate").notNull(),
    awakenedMultiplier: real("awakened_multiplier").notNull().default(0.5),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    catchRange: check("capture_rules_catch_range", sql`${t.catchRate} >= 1 AND ${t.catchRate} <= 255`),
    awakenedRange: check(
      "capture_rules_awakened_range",
      sql`${t.awakenedMultiplier} > 0 AND ${t.awakenedMultiplier} <= 2`,
    ),
  }),
);

/**
 * Which moves a creature knows. Upsert semantics on (creature, ability),
 * matching the `drops` / `map_biomes` junction pattern already in the repo.
 *
 * `learnLevel` 1 means the creature starts with it.
 */
export const creatureAbilities = pgTable(
  "creature_abilities",
  {
    id: serial("id").primaryKey(),
    creatureId: integer("creature_id")
      .notNull()
      .references(() => creatures.id, { onDelete: "cascade" }),
    abilityId: integer("ability_id")
      .notNull()
      .references(() => abilities.id, { onDelete: "cascade" }),
    learnLevel: integer("learn_level").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    uniquePair: unique().on(t.creatureId, t.abilityId),
    levelRange: check("creature_abilities_level_range", sql`${t.learnLevel} >= 1 AND ${t.learnLevel} <= 100`),
  }),
);

/**
 * As constantes que governam o combate. Linha única — a checagem `id = 1`
 * garante o singleton no banco, não só por convenção.
 *
 * Estas viviam no script de export, o que contrariava a regra de que os
 * números moram no bestiário: ajustar balanceamento exigia editar código e
 * não gerava changelog. Agora uma mudança de tuning é um PATCH versionado
 * como qualquer outra decisão de design.
 *
 * Os limites de cada coluna não são decorativos. `damageConstant` fora de
 * (0, 2] ou `chargeNeutralCharge` em zero não são valores ruins — são
 * valores que quebram a aritmética do jogo, e o banco recusa.
 */
export const combatRules = pgTable(
  "combat_rules",
  {
    id: integer("id").primaryKey().default(1),

    /** Escala global do dano. Menor = lutas mais longas. */
    damageConstant: real("damage_constant").notNull().default(0.4),
    damageVarianceMin: real("damage_variance_min").notNull().default(0.9),
    damageVarianceMax: real("damage_variance_max").notNull().default(1.1),
    /** Piso: nenhum golpe que acerta causa zero. */
    damageMinimum: integer("damage_minimum").notNull().default(1),

    /** Valor que enche o medidor do Despertar Ancestral. */
    chargeMax: integer("charge_max").notNull().default(100),
    /** Peso do dano sofrido no enchimento. */
    chargeTakenMultiplier: real("charge_taken_multiplier").notNull().default(1.0),
    /** Peso do dano causado. Menor que o de sofrer, por design. */
    chargeDealtMultiplier: real("charge_dealt_multiplier").notNull().default(0.5),
    /** Valor de referência do stat Carga: acima disso enche mais rápido. */
    chargeNeutralCharge: integer("charge_neutral_charge").notNull().default(50),

    /** Captura nunca é impossível nem garantida. */
    captureMinChance: real("capture_min_chance").notNull().default(0.01),
    captureMaxChance: real("capture_max_chance").notNull().default(0.95),

    levelMin: integer("level_min").notNull().default(1),
    levelMax: integer("level_max").notNull().default(50),

    /** Multiplicador de um par elemental ausente de `elemental_advantages`. */
    elementNeutralMultiplier: real("element_neutral_multiplier").notNull().default(1.0),

    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    singleton: check("combat_rules_singleton", sql`${t.id} = 1`),
    damageConstantRange: check(
      "combat_rules_damage_constant_range",
      sql`${t.damageConstant} > 0 AND ${t.damageConstant} <= 2`,
    ),
    varianceOrder: check(
      "combat_rules_variance_order",
      sql`${t.damageVarianceMin} > 0 AND ${t.damageVarianceMin} <= ${t.damageVarianceMax}`,
    ),
    damageMinimumRange: check(
      "combat_rules_damage_minimum_range",
      sql`${t.damageMinimum} >= 0 AND ${t.damageMinimum} <= 100`,
    ),
    chargeMaxRange: check(
      "combat_rules_charge_max_range",
      sql`${t.chargeMax} > 0 AND ${t.chargeMax} <= 1000`,
    ),
    chargeMultiplierRange: check(
      "combat_rules_charge_multiplier_range",
      sql`${t.chargeTakenMultiplier} >= 0 AND ${t.chargeTakenMultiplier} <= 20
          AND ${t.chargeDealtMultiplier} >= 0 AND ${t.chargeDealtMultiplier} <= 20`,
    ),
    chargeNeutralRange: check(
      "combat_rules_charge_neutral_range",
      sql`${t.chargeNeutralCharge} > 0 AND ${t.chargeNeutralCharge} <= 999`,
    ),
    captureChanceOrder: check(
      "combat_rules_capture_chance_order",
      sql`${t.captureMinChance} >= 0 AND ${t.captureMinChance} <= ${t.captureMaxChance}
          AND ${t.captureMaxChance} <= 1`,
    ),
    levelOrder: check(
      "combat_rules_level_order",
      sql`${t.levelMin} >= 1 AND ${t.levelMin} <= ${t.levelMax} AND ${t.levelMax} <= 999`,
    ),
    elementNeutralRange: check(
      "combat_rules_element_neutral_range",
      sql`${t.elementNeutralMultiplier} > 0 AND ${t.elementNeutralMultiplier} <= 10`,
    ),
  }),
);

/**
 * O que um item *faz* e quanto ele vale. 1:1 com `items`, mesmo padrão de
 * `ability_stats` — o catálogo em `items` descreve para humano, isto executa.
 *
 * Separar em tabela própria, em vez de engordar `items`, mantém a divisão que
 * o repo já tem: catálogo editorial de um lado, números afináveis do outro.
 * Mudar preço vira upsert versionado, não edição de ficha.
 */
export const itemStats = pgTable(
  "item_stats",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .unique()
      .references(() => items.id, { onDelete: "cascade" }),

    /** Preço de compra, na moeda de `economy_rules`. O de venda sai do `sellRatio`. */
    value: integer("value").notNull().default(0),

    effectCode: itemEffectEnum("effect_code").notNull().default("none"),
    /**
     * Significado depende do `effectCode`: multiplicador da chance em
     * `capture_bonus`, pontos de HP em `heal_flat`, porcentagem do HP máximo
     * em `heal_percent`. Ignorado em `none`.
     */
    effectValue: real("effect_value").notNull().default(0),

    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    valueRange: check("item_stats_value_range", sql`${t.value} >= 0 AND ${t.value} <= 1000000`),
    effectValueRange: check(
      "item_stats_effect_value_range",
      sql`${t.effectValue} >= 0 AND ${t.effectValue} <= 1000`,
    ),
  }),
);

/**
 * As constantes da economia. Linha única, igual a `combat_rules` — e pelo
 * mesmo motivo: nenhum número de tuning pode morar em código, porque lá ele
 * não gera changelog nem versão.
 */
export const economyRules = pgTable(
  "economy_rules",
  {
    id: integer("id").primaryKey().default(1),

    /**
     * Nome da moeda, em exibição. Fica aqui e não numa constante do Godot
     * porque renomear a moeda é decisão de conteúdo, não de código.
     */
    currencyName: text("currency_name").notNull().default("Óbolo"),
    currencyNamePlural: text("currency_name_plural").notNull().default("Óbolos"),

    /** Quanto o jogador começa com. */
    startingCurrency: integer("starting_currency").notNull().default(120),

    /**
     * Fração do `value` que o comerciante paga ao comprar do jogador. O
     * spread entre comprar e vender é a margem dele — em 1.0 o jogador
     * lucraria comprando e revendendo em loop.
     */
    sellRatio: real("sell_ratio").notNull().default(0.4),

    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    singleton: check("economy_rules_singleton", sql`${t.id} = 1`),
    sellRatioRange: check(
      "economy_rules_sell_ratio_range",
      sql`${t.sellRatio} > 0 AND ${t.sellRatio} < 1`,
    ),
    startingRange: check(
      "economy_rules_starting_range",
      sql`${t.startingCurrency} >= 0 AND ${t.startingCurrency} <= 1000000`,
    ),
  }),
);

/**
 * As constantes da progressão de nível. Linha única, como `combat_rules` e
 * `economy_rules`.
 *
 * Subir de nível exige **duas** condições ao mesmo tempo — XP acumulado e
 * material consumido:
 *
 *     xpToNext(nivel)  = floor(xpCurveBase * nivel ^ xpCurveExponent)
 *     xpGanho(alvo)    = floor(alvo.xpYield * nivelDoAlvo / xpYieldDivisor)
 *     custo(nivel)     = itemCostBase + floor(nivel / itemCostLevelStep)
 *
 * O material é o item de `category = 'material'` da **classe da própria
 * criatura que sobe** — Loricati gasta Quitina Fossilizada e nada mais. Como
 * o drop só vem de derrotar selvagens da mesma classe, o gate empurra o
 * jogador a caçar dentro da linhagem que quer evoluir, em vez de moer o
 * encontro mais fácil do mapa.
 *
 * A curva de custo é deliberadamente rasa (1 unidade até o nível 19, 2 até o
 * 39, 3 daí em diante — 89 unidades no total até o teto). Contra uma taxa de
 * drop de 0.85 e um terço dos encontros sendo da classe certa, isso deixa o
 * material apertado no fim da subida sem transformá-lo na parede principal:
 * o XP continua sendo o eixo, o material é o portão.
 */
export const progressionRules = pgTable(
  "progression_rules",
  {
    id: integer("id").primaryKey().default(1),

    /** Escala da curva de XP. Maior = cada nível pede mais. */
    xpCurveBase: real("xp_curve_base").notNull().default(14),
    /** Inclinação da curva. 1.0 seria linear; acima disso o fim da subida pesa. */
    xpCurveExponent: real("xp_curve_exponent").notNull().default(1.7),
    /** Divisor do XP concedido. Maior = derrotas valem menos. */
    xpYieldDivisor: real("xp_yield_divisor").notNull().default(5),

    /** Unidades de material exigidas já no primeiro nível. */
    itemCostBase: integer("item_cost_base").notNull().default(1),
    /** A cada quantos níveis o custo sobe em uma unidade. */
    itemCostLevelStep: integer("item_cost_level_step").notNull().default(20),

    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    singleton: check("progression_rules_singleton", sql`${t.id} = 1`),
    /**
     * Os literais vão convertidos para `real` pelo mesmo motivo documentado
     * em `creature_stats.sizeRange`: a coluna é float4 e o literal cru seria
     * float8, então o CHECK recusaria o próprio valor de fronteira.
     */
    xpCurveBaseRange: check(
      "progression_rules_xp_curve_base_range",
      sql`${t.xpCurveBase} > 0::real AND ${t.xpCurveBase} <= 1000::real`,
    ),
    xpCurveExponentRange: check(
      "progression_rules_xp_curve_exponent_range",
      sql`${t.xpCurveExponent} >= 1::real AND ${t.xpCurveExponent} <= 4::real`,
    ),
    /** Zero dividiria por zero na fórmula de XP — o banco recusa. */
    xpYieldDivisorRange: check(
      "progression_rules_xp_yield_divisor_range",
      sql`${t.xpYieldDivisor} > 0::real AND ${t.xpYieldDivisor} <= 100::real`,
    ),
    itemCostBaseRange: check(
      "progression_rules_item_cost_base_range",
      sql`${t.itemCostBase} >= 0 AND ${t.itemCostBase} <= 100`,
    ),
    /** Zero faria `floor(nivel / step)` dividir por zero. */
    itemCostLevelStepRange: check(
      "progression_rules_item_cost_level_step_range",
      sql`${t.itemCostLevelStep} > 0 AND ${t.itemCostLevelStep} <= 999`,
    ),
  }),
);

export type ProgressionRule = typeof progressionRules.$inferSelect;
export type NewProgressionRule = typeof progressionRules.$inferInsert;

export type CombatRule = typeof combatRules.$inferSelect;
export type NewCombatRule = typeof combatRules.$inferInsert;
export type ItemStat = typeof itemStats.$inferSelect;
export type NewItemStat = typeof itemStats.$inferInsert;
export type EconomyRule = typeof economyRules.$inferSelect;
export type NewEconomyRule = typeof economyRules.$inferInsert;

export type CreatureStat = typeof creatureStats.$inferSelect;
export type NewCreatureStat = typeof creatureStats.$inferInsert;
export type AbilityStat = typeof abilityStats.$inferSelect;
export type NewAbilityStat = typeof abilityStats.$inferInsert;
export type CaptureRule = typeof captureRules.$inferSelect;
export type NewCaptureRule = typeof captureRules.$inferInsert;
export type CreatureAbility = typeof creatureAbilities.$inferSelect;
export type NewCreatureAbility = typeof creatureAbilities.$inferInsert;
