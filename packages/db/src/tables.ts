/**
 * Toda tabela de dados do bestiário, em ordem de inserção — pais antes de
 * filhos. `TRUNCATE ... CASCADE` ignora a ordem, mas o `INSERT` do restore
 * não.
 *
 * **Tabela nova precisa entrar aqui.** Esquecer é silencioso da pior forma: o
 * dump roda, reporta sucesso, e o snapshot sai sem ela — e como o restore usa
 * a mesma lista, ninguém percebe até precisar dos dados numa máquina nova.
 * Foi exatamente o que aconteceu com a camada de números inteira enquanto
 * esta lista morava no `pull.ts`: `creature_stats`, `ability_stats`,
 * `capture_rules` e `creature_abilities` nunca estiveram nela, e todo dev
 * hidratado ficava com catálogo completo e zero números.
 *
 * A lista vive num módulo próprio, e não dentro de um script, justamente para
 * que dump e restore não possam divergir sobre o que existe.
 */
export const TABLES: readonly string[] = [
  // Referência — sem dependências.
  "elements",
  "creature_classes",
  "biomes",
  "game_maps",
  "items",
  "design_documents",
  "changelog",

  // Junções e catálogo com FK.
  "elemental_advantages",
  "map_biomes",
  "npcs",
  "creatures",
  "abilities",
  "awakenings",
  "missions",
  "drops",
  "mining_rates",
  "merchant_offers",

  // Camada de números — o que o jogo executa.
  "creature_stats",
  "ability_stats",
  "capture_rules",
  "creature_abilities",
  "item_stats",
  "combat_rules",
  "economy_rules",
  "progression_rules",
];

/**
 * Ordena versões (`0.NN`) numericamente.
 *
 * `ORDER BY version DESC` sozinho compara texto, e a partir da centésima
 * versão `'0.99' > '0.104'` — o que fazia todo checador de staleness reportar
 * `0.99` para sempre. Separar os dois campos e converter para inteiro é o
 * conserto.
 */
export const LATEST_VERSION_SQL = `
  SELECT version FROM changelog
  ORDER BY split_part(version, '.', 1)::int DESC,
           split_part(version, '.', 2)::int DESC
  LIMIT 1
`;
