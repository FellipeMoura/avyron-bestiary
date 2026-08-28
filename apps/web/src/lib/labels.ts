/**
 * Enum values are stored in English in the database (`reinforcement`,
 * `paleozoic`, ...) but the UI shows everything in Portuguese. This file is
 * the single source of truth for those translations — call the helpers when
 * rendering, never inline the strings.
 */

/**
 * The eras carry in-world names, not geological ones — see the `nomenclatura`
 * document. The database enum stays `paleozoic` / `mesozoic` / `cenozoic`
 * because that is code; only the label changes.
 */
export const ERA_LABEL: Record<"paleozoic" | "mesozoic" | "cenozoic", string> = {
  paleozoic: "Aetheris",
  mesozoic: "Titanor",
  cenozoic: "Novaterra",
};

/** Real geological era behind each in-world name, for tooltips and docs. */
export const ERA_SCIENTIFIC_LABEL: Record<"paleozoic" | "mesozoic" | "cenozoic", string> = {
  paleozoic: "paleozoico",
  mesozoic: "mesozoico",
  cenozoic: "cenozoico",
};

export const AWAKENING_TYPE_LABEL: Record<"reinforcement" | "swap", string> = {
  reinforcement: "reforço",
  swap: "troca",
};

export const DOCUMENT_STATUS_LABEL: Record<"defined" | "partial" | "pending", string> = {
  defined: "definido",
  partial: "parcial",
  pending: "pendente",
};

export type ItemCategory = "mineral" | "capture" | "heal" | "material";

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  mineral: "mineral",
  capture: "captura",
  heal: "cura",
  material: "material",
};

/**
 * O que a categoria decide no jogo — não é rótulo de vitrine. O export filtra
 * `mineral` nesta coluna para montar a tabela da picareta, e a tela que o NPC
 * abre depende dela.
 */
export const ITEM_CATEGORY_ROLE: Record<ItemCategory, string> = {
  mineral:
    "Mercadoria pura: não se usa, se vende. É a coluna que o export lê para montar a tabela da picareta — item fora dela nunca é sorteado ao minerar.",
  capture:
    "Consumível de captura. Multiplica a chance calculada a partir do catchRate da criatura, dentro dos limites de combat_rules.",
  heal: "Consumível de cura. Devolve vigor à criatura escolhida e concorre com a regeneração passiva de 10 %/min.",
  material:
    "Material de progressão: cai de criatura selvagem derrotada (a classe do derrotado decide qual) e é gasto, junto com XP, na subida de nível. Fica fora de mineral de propósito — nunca é sorteado ao minerar.",
};

export type ItemEffect = "none" | "capture_bonus" | "heal_flat" | "heal_percent";

export const ITEM_EFFECT_LABEL: Record<ItemEffect, string> = {
  none: "nenhum",
  capture_bonus: "bônus de captura",
  heal_flat: "cura fixa",
  heal_percent: "cura proporcional",
};

/**
 * `effectValue` é uma coluna só servindo códigos que a leem de formas
 * diferentes — multiplicador cru em `capture_bonus`, pontos em `heal_flat`,
 * pontos percentuais em `heal_percent`. Ler o número sem o código ao lado dá
 * um valor plausível e errado, então a leitura mora aqui, em um lugar só.
 */
export function itemEffectSummary(effectCode: ItemEffect, effectValue: number): string {
  switch (effectCode) {
    case "capture_bonus":
      return `×${formatNumber(effectValue)} na chance de captura`;
    case "heal_flat":
      return `${formatNumber(effectValue)} ${plural(effectValue, "ponto")} de vigor`;
    case "heal_percent":
      return `${formatNumber(effectValue)}% do vigor máximo`;
    case "none":
      return "sem efeito de uso";
  }
}

/** Números em pt-BR: vírgula decimal, ponto de milhar. */
export function formatNumber(n: number, maximumFractionDigits = 2): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits });
}

/** `12 Óbolos`, `1 Óbolo` — o nome da moeda vem de `economy_rules`. */
export function formatCurrency(
  value: number,
  currency: { currencyName: string; currencyNamePlural: string } | undefined,
): string {
  const noun = currency
    ? value === 1
      ? currency.currencyName
      : currency.currencyNamePlural
    : "";
  return `${formatNumber(value, 0)}${noun ? ` ${noun}` : ""}`;
}

/**
 * Pluralization helper. Portuguese doesn't need much beyond adding "s", but a
 * few nouns we render often (like "resultado") deserve the small ceremony to
 * keep call sites readable.
 */
export function plural(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

export type PrimaryStat = "hp" | "attack" | "defense" | "speed" | "charge";

/**
 * The stat a class specialises in, in the words the player sees.
 *
 * The tokens are the game's own five stats, and two of the labels do not
 * translate them literally on purpose. `speed` decides who acts first in a
 * turn-based fight, which is what "velocidade de ataque" means to a player;
 * `charge` is the Despertar meter, the only sustain resource a creature has,
 * which is what the design calls Stamina. Naming the columns `attackSpeed`
 * and `stamina` instead would have created a second vocabulary for stats the
 * game already computes — the split lives here, where every other enum
 * translation lives.
 */
export const PRIMARY_STAT_LABEL: Record<PrimaryStat, string> = {
  hp: "HP",
  attack: "Ataque",
  defense: "Defesa",
  speed: "Velocidade de Ataque",
  charge: "Stamina",
};

export function primaryStatLabel(stat: string | null | undefined): string {
  if (!stat) return "—";
  return PRIMARY_STAT_LABEL[stat as PrimaryStat] ?? stat;
}

// ---------------------------------------------------------------------------

export type AbilityEffect =
  | "damage"
  | "buff_attack"
  | "buff_defense"
  | "debuff_attack"
  | "debuff_defense"
  | "heal"
  | "charge_gain";

export const ABILITY_EFFECT_LABEL: Record<AbilityEffect, string> = {
  damage: "dano",
  buff_attack: "eleva ataque",
  buff_defense: "eleva defesa",
  debuff_attack: "reduz ataque",
  debuff_defense: "reduz defesa",
  heal: "cura",
  charge_gain: "ganho de carga",
};

/**
 * O papel de trabalho da classe na mineração, vindo do JSON de
 * `creature_classes.workFunction`. São cinco tokens em inglês no banco porque
 * é o que o Godot lê; os nomes abaixo são os que o designer usa para falar
 * deles, e cada um precisa soar diferente dos outros quatro — "escavadora" e
 * "cavadora" seriam a mesma palavra para quem lê a lista de uma vez.
 */
export const WORK_ROLE_LABEL: Record<string, string> = {
  excavator: "escavadora",
  burrower: "tuneleira",
  prospector: "garimpeira",
  sifter: "peneiradora",
  crusher: "britadeira",
};

export function workRoleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return WORK_ROLE_LABEL[role] ?? role;
}

/** `{speedModifier, role}` serializado em texto. Linhas antigas podem trazer
 *  chaves extras (`preferredOres`) que não viajam mais no bundle. */
export interface WorkFunction {
  speedModifier?: number;
  role?: string;
}

export function parseWorkFunction(raw: string | null | undefined): WorkFunction | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as WorkFunction;
  } catch {
    return null;
  }
}

/** `0,85` vira `−15% de velocidade`; `1` vira `velocidade padrão`. */
export function speedModifierSummary(modifier: number | undefined): string {
  if (modifier === undefined) return "—";
  if (modifier === 1) return "velocidade padrão do trabalho";
  const delta = (modifier - 1) * 100;
  return `${delta > 0 ? "+" : "−"}${formatNumber(Math.abs(delta), 0)}% de velocidade`;
}

/**
 * `×2` / `×0,5` / `×1`, com a leitura junto. O multiplicador cru sozinho é
 * ambíguo na direção: quem lê `0,5` numa linha de "defende contra" precisa
 * saber se é bom ou ruim para quem está sendo mostrado.
 */
export function advantageLabel(multiplier: number): string {
  if (multiplier > 1) return "vantagem";
  if (multiplier < 1) return "desvantagem";
  return "neutro";
}

/**
 * Valor efetivo de um stat, exatamente como o jogo calcula:
 * `floor(base × (1 + growthRate × (nível − 1)) × (1 + bônus/100))`, e o
 * bônus da classe entra em um stat só. Espelhar a conta aqui é o que permite
 * a ficha dizer "no nível 50" sem que alguém precise abrir o Godot.
 */
export function effectiveStat(
  base: number,
  growthRate: number,
  level: number,
  bonusPct = 0,
): number {
  return Math.floor(base * (1 + growthRate * (level - 1)) * (1 + bonusPct / 100));
}
