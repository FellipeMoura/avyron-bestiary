import {
  useEconomyRules,
  useEquipment,
  useEquipmentRecipes,
  useEquipmentStats,
  useItemStats,
  useItems,
} from "../hooks/useApi";
import { formatCurrency, plural } from "../lib/labels";

/**
 * EQP — o resto do set do domador, fora do Relicário.
 *
 * A tela existe por uma razão que nenhuma das outras tinha: aqui o número que
 * importa não está em nenhuma coluna. **O custo em óbolos de uma receita é uma
 * conta** — soma de `item_stats.value × quantidade` — e é ele que carrega a
 * decisão de design do sistema: Amplificador e Encantador do mesmo tier custam
 * exatamente o mesmo, e o que separa as duas linhas é onde se cava, não
 * quanto se paga. Ver documento `equipamentos`.
 *
 * Por isso cada receita mostra o total ao lado dos ingredientes, e por isso os
 * dois slots ficam lado a lado em vez de um sob o outro: a comparação É o
 * conteúdo da tela. Se um dia os dois lados divergirem, tem de dar para ver
 * daqui sem abrir planilha.
 *
 * Quieta como a de itens — a ficha de criatura segue sendo o único lugar com
 * peso visual.
 */

const SLOT_ORDER = ["amplifier", "enchanter"] as const;

const SLOT_LABEL: Record<string, string> = {
  amplifier: "Amplificador",
  enchanter: "Encantador",
};

/** O que o slot faz, em uma frase — é ele que decide o alvo, não o efeito. */
const SLOT_ROLE: Record<string, string> = {
  amplifier:
    "Aplica o modificador na criatura do próprio jogador. Passivo enquanto equipado, sem custo de turno.",
  enchanter:
    "Aplica o modificador na criatura adversária. Mesmo eixo do Amplificador, visto do outro lado.",
};

const EFFECT_LABEL: Record<string, string> = {
  buff_attack: "ataque",
  buff_defense: "defesa",
  debuff_attack: "ataque",
  debuff_defense: "defesa",
};

export function Equipment() {
  const equipment = useEquipment();
  const stats = useEquipmentStats();
  const recipes = useEquipmentRecipes();
  const items = useItems();
  const itemStats = useItemStats();
  const economy = useEconomyRules();

  const statByEquipment = new Map((stats.data ?? []).map((s) => [s.equipmentId, s]));
  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]));
  const valueByItem = new Map((itemStats.data ?? []).map((s) => [s.itemId, s.value]));

  const recipesByEquipment = new Map<number, NonNullable<typeof recipes.data>>();
  for (const line of recipes.data ?? []) {
    const list = recipesByEquipment.get(line.equipmentId) ?? [];
    list.push(line);
    recipesByEquipment.set(line.equipmentId, list);
  }

  const rows = equipment.data ?? [];
  const count = rows.length;
  const withStats = rows.filter((e) => statByEquipment.has(e.id)).length;

  /** O custo da receita em óbolos — a conta que nenhuma coluna guarda. */
  const recipeValue = (equipmentId: number) =>
    (recipesByEquipment.get(equipmentId) ?? []).reduce(
      (total, line) => total + (valueByItem.get(line.itemId) ?? 0) * line.quantity,
      0,
    );

  const groups = SLOT_ORDER.map((slot) => ({
    slot,
    rows: rows
      .filter((e) => e.slot === slot)
      .sort(
        (a, b) =>
          (statByEquipment.get(a.id)?.tier ?? 0) - (statByEquipment.get(b.id)?.tier ?? 0),
      ),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-12">
      <header>
        <p className="font-mono text-micro tracking-widest text-graphite">EQP</p>
        <h1 className="mt-2 font-display text-2xl text-bone">Equipamentos</h1>
        <p className="mt-3 max-w-2xl font-sans text-base text-bone/80">
          O set do domador fora do Relicário. Peças passivas — valem a batalha inteira, não
          custam turno e não se consomem. Cada modelo é um tier, e um tier é uma receita: a
          progressão destas peças é a mineração, não uma barra de XP.
        </p>
        <p className="mt-3 font-mono text-xs text-graphite">
          {count} {plural(count, "modelo", "modelos")}
          {" · "}
          <span className={withStats === count ? "text-moss" : "text-bone"}>
            {withStats} com números definidos
          </span>
        </p>
      </header>

      {equipment.isLoading && <p className="font-mono text-xs text-graphite">carregando…</p>}
      {equipment.error && (
        <p className="font-mono text-xs text-ember">erro: {String(equipment.error)}</p>
      )}
      {equipment.data && count === 0 && (
        <p className="font-mono text-xs text-graphite">nenhum equipamento cadastrado.</p>
      )}

      <div className="grid gap-12 lg:grid-cols-2">
        {groups.map((group) => (
          <section key={group.slot}>
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-xl text-bone">{SLOT_LABEL[group.slot]}</h2>
              <span className="font-mono text-micro uppercase tracking-widest text-graphite">
                {group.rows.length} {plural(group.rows.length, "tier", "tiers")}
              </span>
            </div>
            <p className="mt-2 max-w-md font-sans text-xs text-bone/70">
              {SLOT_ROLE[group.slot]}
            </p>

            <ul className="mt-6 border-y border-graphite/30">
              {group.rows.map((model) => (
                <ModelRow
                  key={model.code}
                  model={model}
                  stat={statByEquipment.get(model.id)}
                  lines={recipesByEquipment.get(model.id) ?? []}
                  itemById={itemById}
                  valueByItem={valueByItem}
                  total={recipeValue(model.id)}
                  economy={economy.data}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Legend />
    </div>
  );
}

// ---------------------------------------------------------------------------

type Model = NonNullable<ReturnType<typeof useEquipment>["data"]>[number];
type Stat = NonNullable<ReturnType<typeof useEquipmentStats>["data"]>[number];
type RecipeLine = NonNullable<ReturnType<typeof useEquipmentRecipes>["data"]>[number];
type Item = NonNullable<ReturnType<typeof useItems>["data"]>[number];
type Economy = ReturnType<typeof useEconomyRules>["data"];

interface ModelRowProps {
  model: Model;
  stat: Stat | undefined;
  lines: RecipeLine[];
  itemById: Map<number, Item>;
  valueByItem: Map<number, number>;
  total: number;
  economy: Economy;
}

function ModelRow({
  model,
  stat,
  lines,
  itemById,
  valueByItem,
  total,
  economy,
}: ModelRowProps) {
  // O sinal sai do código do efeito, nunca escrito à mão — é a mesma regra que
  // o jogo aplica, e escrever "−" aqui criaria a segunda fonte que discorda da
  // primeira quando um efeito novo aparecer.
  const negative = stat?.effectCode.startsWith("debuff_") ?? false;
  const sign = negative ? "−" : "+";

  return (
    <li className="border-b border-graphite/30 py-5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-micro text-graphite">{model.code}</span>
        {stat && (
          <span className="font-mono text-micro uppercase tracking-widest text-graphite">
            T{stat.tier}
          </span>
        )}
        <span className="font-display text-base text-bone">{model.name}</span>
        {stat ? (
          <span className={negative ? "font-mono text-sm text-ember" : "font-mono text-sm text-moss"}>
            {sign}
            {stat.effectValue}% {EFFECT_LABEL[stat.effectCode] ?? stat.effectCode}
          </span>
        ) : (
          // Modelo sem stats não vira linha vazia: o jogo o carregaria com
          // efeito nulo, e a tela tem de dizer isso em voz alta.
          <span className="font-mono text-sm text-ember">sem números definidos</span>
        )}
      </div>

      {model.effect && (
        <p className="mt-2 max-w-md font-sans text-sm text-bone/80">{model.effect}</p>
      )}

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-micro uppercase tracking-widest text-graphite">
          receita
        </span>
        {lines.length === 0 ? (
          // Sem receita a peça é inalcançável — a bancada é a única fonte, e
          // ela lista o que tem receita. O export aborta nesse caso; aqui a
          // tela mostra por quê antes de alguém tentar exportar.
          <span className="font-mono text-xs text-ember">
            sem receita — inalcançável no jogo
          </span>
        ) : (
          lines
            .slice()
            .sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0))
            .map((line) => {
              const item = itemById.get(line.itemId);
              return (
                <span key={line.id} className="font-mono text-xs text-bone/80">
                  {line.quantity}× {item?.name ?? `#${line.itemId}`}
                  <span className="text-graphite">
                    {" "}
                    ({(valueByItem.get(line.itemId) ?? 0) * line.quantity})
                  </span>
                </span>
              );
            })
        )}
      </div>

      {lines.length > 0 && (
        <p className="mt-2 font-mono text-xs text-graphite">
          custo do material:{" "}
          <span className="text-bone">
            {economy ? formatCurrency(total, economy) : total}
          </span>
        </p>
      )}
    </li>
  );
}

function Legend() {
  return (
    <section className="border-t border-graphite/40 pt-6">
      <p className="font-mono text-micro uppercase tracking-widest text-graphite">
        o que cada campo decide no jogo
      </p>
      <dl className="mt-4 grid gap-x-8 gap-y-3 font-sans text-sm text-bone/80 md:grid-cols-2">
        <div>
          <dt className="font-mono text-xs text-bone">slot</dt>
          <dd>
            Decide <strong>em quem</strong> o modificador cai — a criatura do jogador ou a do
            adversário. O código do efeito decide só qual stat se move.
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-bone">tier</dt>
          <dd>
            Ordena a bancada e nomeia o modelo. Nenhuma fórmula o lê: a potência é o valor do
            efeito sozinho, para um retune nunca precisar manter duas colunas de acordo.
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-bone">valor do efeito</dt>
          <dd>
            Pontos percentuais, nunca fração — <code>10</code> é 10 %. O jogo aplica como{" "}
            <code>modificador ×= 1 ± valor/100</code>, com o mesmo teto acumulado que vale para
            as habilidades de suporte.
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs text-bone">receita</dt>
          <dd>
            Só aceita minério. O total em óbolos é conta, não coluna — e os dois slots do mesmo
            tier têm de bater: o Encantador é a peça <em>longe</em>, não a peça cara.
          </dd>
        </div>
      </dl>
    </section>
  );
}
