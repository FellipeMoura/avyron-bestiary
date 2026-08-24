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
