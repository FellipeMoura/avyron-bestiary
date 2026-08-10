import { Link, useSearchParams } from "react-router-dom";
import { Filter } from "../components/Filter";
import {
  useBiomes,
  useCreatureClasses,
  useEconomyRules,
  useItemStats,
  useItems,
  useMerchantOffers,
  useMiningRates,
  useNpcs,
} from "../hooks/useApi";
import { cn } from "../lib/cn";
import {
  ITEM_CATEGORY_LABEL,
  ITEM_CATEGORY_ROLE,
  ITEM_EFFECT_LABEL,
  type ItemCategory,
  formatCurrency,
  formatNumber,
  itemEffectSummary,
  plural,
} from "../lib/labels";

/**
 * ITM — o catálogo de itens com a camada de números ao lado.
 *
 * Dois registros descrevem o mesmo item e não dizem a mesma coisa: `items`
 * é editorial (o que a coisa é, em prosa) e `item_stats` é o que o Godot
 * executa (preço, código de efeito, valor do efeito). Mostrar um sem o outro
 * é o que faz alguém ler "Recupera parte do vigor" e não saber que são 30 %.
 * Por isso cada linha abre com os dois lado a lado, e por isso item sem stats
 * é dito em voz alta em vez de aparecer como linha vazia.
 *
 * A tela é quieta de propósito — a ficha de criatura segue sendo o único
 * lugar com peso visual.
 */

const CATEGORY_ORDER: ItemCategory[] = ["mineral", "heal"];

export function Items() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";

  const items = useItems((category || undefined) as ItemCategory | undefined);
  const itemStats = useItemStats();
  const economy = useEconomyRules();
  const npcs = useNpcs();
  const offers = useMerchantOffers();
  const rates = useMiningRates();
  const classes = useCreatureClasses();
  const biomes = useBiomes();

  const setFilter = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("category", value);
    else next.delete("category");
    setParams(next, { replace: true });
  };

  const statByItem = new Map((itemStats.data ?? []).map((s) => [s.itemId, s]));
  const npcById = new Map((npcs.data ?? []).map((n) => [n.id, n]));
  const classById = new Map((classes.data ?? []).map((c) => [c.id, c]));
  const biomeById = new Map((biomes.data ?? []).map((b) => [b.id, b]));

  const offersByItem = new Map<number, typeof offers.data>();
  for (const offer of offers.data ?? []) {
    const list = offersByItem.get(offer.itemId) ?? [];
    list.push(offer);
    offersByItem.set(offer.itemId, list);
  }

  const ratesByItem = new Map<number, typeof rates.data>();
  for (const rate of rates.data ?? []) {
    const list = ratesByItem.get(rate.itemId) ?? [];
    list.push(rate);
    ratesByItem.set(rate.itemId, list);
  }

  const rows = items.data ?? [];
  const count = items.data?.length;
  const withStats = rows.filter((i) => statByItem.has(i.id)).length;

  const groups = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    rows: rows.filter((i) => i.category === cat),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-12">
      <header>
        <p className="font-mono text-micro tracking-widest text-graphite">ITM</p>
        <h1 className="mt-2 font-display text-2xl text-bone">Itens</h1>
        <p className="mt-3 max-w-2xl font-sans text-base text-bone/80">
          O que se minera, se compra e se usa. Cada item tem uma ficha editorial e, se já
          estiver balanceado, uma linha de números que o jogo executa — preço, código de
          efeito e o valor desse efeito.
        </p>
        <p className="mt-3 font-mono text-xs text-graphite">
          {count ?? "…"} {count !== undefined ? plural(count, "item", "itens") : "carregando"}
          {count !== undefined && (
            <>
              {" · "}
              <span className={withStats === count ? "text-moss" : "text-bone"}>
                {withStats} com números definidos
              </span>
            </>
          )}
        </p>
      </header>

      {/* as constantes da economia — o denominador de todo preço abaixo */}
      <section className="grid grid-cols-2 gap-x-8 gap-y-6 border-y border-graphite/40 py-6 md:grid-cols-3">
        <Metric label="moeda" value={economy.data?.currencyNamePlural ?? "—"} />
        <Metric
          label="bolsa inicial"
          value={
            economy.data ? formatCurrency(economy.data.startingCurrency, economy.data) : "—"
          }
        />
        <Metric
          label="o comerciante paga"
          value={economy.data ? `${formatNumber(economy.data.sellRatio * 100, 0)}%` : "—"}
          hint="do valor do item, ao comprar do jogador"
        />
      </section>

      <section className="flex flex-wrap items-center gap-4">
        <Filter
          label="categoria"
          value={category}
          onChange={setFilter}
          options={[
            { value: "", label: "todas as categorias" },
            ...CATEGORY_ORDER.map((c) => ({ value: c, label: ITEM_CATEGORY_LABEL[c] })),
          ]}
        />
        <span className="font-mono text-micro text-graphite">
          clique numa linha para abrir a ficha completa
        </span>
      </section>

      {items.isLoading &&<p className="font-mono text-xs text-graphite">carregando…</p>}
      {items.error && (
        <p className="font-mono text-xs text-ember">erro: {String(items.error)}</p>
      )}
      {items.data && items.data.length === 0 && (
        <p className="font-mono text-xs text-graphite">nenhum item nesta categoria.</p>
      )}

      {groups.map((group) => (
        <section key={group.category}>
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-xl text-bone">
              {ITEM_CATEGORY_LABEL[group.category]}
            </h2>
            <span className="font-mono text-micro uppercase tracking-widest text-graphite">
              {group.rows.length} {plural(group.rows.length, "item", "itens")}
            </span>
          </div>
          <p className="mt-2 max-w-2xl font-sans text-xs text-bone/70">
            {ITEM_CATEGORY_ROLE[group.category]}
          </p>

          <ul className="mt-6 border-y border-graphite/30">
            {group.rows.map((item) => (
              <ItemRow
                key={item.code}
                item={item}
                stat={statByItem.get(item.id)}
                economy={economy.data}
                offers={offersByItem.get(item.id) ?? []}
                npcById={npcById}
                rates={ratesByItem.get(item.id) ?? []}
                classById={classById}
                biomeById={biomeById}
              />
            ))}
          </ul>
        </section>
      ))}

      <Legend economy={economy.data} />
    </div>
  );
}

// ---------------------------------------------------------------------------

type Item = NonNullable<ReturnType<typeof useItems>["data"]>[number];
type ItemStat = NonNullable<ReturnType<typeof useItemStats>["data"]>[number];
type Economy = ReturnType<typeof useEconomyRules>["data"];
type Offer = NonNullable<ReturnType<typeof useMerchantOffers>["data"]>[number];
type Npc = NonNullable<ReturnType<typeof useNpcs>["data"]>[number];
type Rate = NonNullable<ReturnType<typeof useMiningRates>["data"]>[number];
type CreatureClass = NonNullable<ReturnType<typeof useCreatureClasses>["data"]>[number];
type Biome = NonNullable<ReturnType<typeof useBiomes>["data"]>[number];

interface ItemRowProps {
  item: Item;
  stat: ItemStat | undefined;
  economy: Economy;
  offers: Offer[];
  npcById: Map<number, Npc>;
  rates: Rate[];
  classById: Map<number, CreatureClass>;
  biomeById: Map<number, Biome>;
}

/**
 * `<details>` nativo em vez de acordeão com estado: teclado, busca do
 * navegador e impressão funcionam de graça, e não há um componente a mais
 * para manter.
 */
function ItemRow({
  item,
  stat,
  economy,
  offers,
  npcById,
  rates,
  classById,
  biomeById,
}: ItemRowProps) {
  const sell = stat && economy ? sellPrice(stat.value, economy.sellRatio) : null;

  return (
    <li className="border-b border-graphite/30 last:border-b-0">
      <details className="group">
        <summary
          className={cn(
            "grid cursor-pointer list-none grid-cols-[90px_1fr_20px] items-baseline gap-4 py-4",
            "transition-colors hover:bg-slate/50 md:grid-cols-[90px_1.4fr_1fr_1fr_20px]",
            "focus-visible:outline focus-visible:outline-1 focus-visible:outline-ember",
            // Safari desenha o triângulo mesmo com list-none; o indicador é o
            // + / − abaixo, que é o mesmo em todo navegador.
            "[&::-webkit-details-marker]:hidden",
          )}
        >
          <span className="font-mono text-xs text-ember">{item.code}</span>
          <span className="font-display text-lg text-bone">{item.name}</span>
          <span className="hidden font-mono text-xs text-bone/70 md:inline">
            {stat ? formatCurrency(stat.value, economy) : "sem preço"}
          </span>
          <span className="hidden font-mono text-xs text-bone/70 md:inline">
            {stat && stat.effectCode !== "none"
              ? itemEffectSummary(stat.effectCode, stat.effectValue)
              : "—"}
          </span>
          <span
            aria-hidden
            className="justify-self-end font-mono text-micro text-graphite group-open:hidden"
          >
            +
          </span>
          <span
            aria-hidden
            className="hidden justify-self-end font-mono text-micro text-graphite group-open:inline"
          >
            −
          </span>
        </summary>

        <div className="grid grid-cols-1 gap-x-10 gap-y-8 pb-8 pt-2 md:grid-cols-2">
          <div>
            <Eyebrow>catálogo</Eyebrow>
            <Rows
              rows={[
                ["categoria", ITEM_CATEGORY_LABEL[item.category]],
                ["aquisição", item.acquisition ?? "—"],
              ]}
            />
            {item.effect && (
              <Note label="efeito descrito">{item.effect}</Note>
            )}
            {item.notes && <Note label="notas">{item.notes}</Note>}
          </div>

          <div>
            <Eyebrow>números que o jogo executa</Eyebrow>
            {stat ? (
              <>
                <Rows
                  rows={[
                    ["preço de compra", formatCurrency(stat.value, economy)],
                    [
                      "o comerciante paga",
                      sell !== null
                        ? `${formatCurrency(sell, economy)}${
                            economy
                              ? ` · ${formatNumber(economy.sellRatio * 100, 0)}% do valor`
                              : ""
                          }`
                        : "—",
                    ],
                    ["código de efeito", ITEM_EFFECT_LABEL[stat.effectCode]],
                    [
                      "valor do efeito",
                      stat.effectCode === "none"
                        ? "—"
                        : `${formatNumber(stat.effectValue)} · ${itemEffectSummary(
                            stat.effectCode,
                            stat.effectValue,
                          )}`,
                    ],
                  ]}
                />
                {stat.notes && <Note label="notas de balanceamento">{stat.notes}</Note>}
              </>
            ) : (
              <p className="mt-4 font-sans text-xs text-bone/60">
                Sem linha em <code className="font-mono text-bone/80">item_stats</code>. O
                item existe no catálogo e o jogo não sabe quanto ele custa nem o que ele
                faz — a ausência é o próprio pendente.
              </p>
            )}
          </div>

          <div>
            <Eyebrow>onde se compra</Eyebrow>
            {offers.length ? (
              <Rows
                rows={offers.map((offer) => {
                  const npc = npcById.get(offer.npcId);
                  return [
                    npc ? `${npc.code} · ${npc.name}` : `NPC #${offer.npcId}`,
                    offer.price !== null
                      ? `${formatCurrency(offer.price, economy)} · preço próprio deste comerciante`
                      : "preço base do item",
                  ];
                })}
              />
            ) : (
              <p className="mt-4 font-sans text-xs text-bone/60">
                Nenhum comerciante carrega este item.
              </p>
            )}
          </div>

          <div>
            <Eyebrow>peso na mineração</Eyebrow>
            {rates.length ? (
              <Rows
                rows={rates.map((rate) => {
                  const subject =
                    rate.classId != null
                      ? classById.get(rate.classId)
                      : rate.biomeId != null
                        ? biomeById.get(rate.biomeId)
                        : undefined;
                  const kind = rate.classId != null ? "classe" : "bioma";
                  return [
                    subject ? `${kind} · ${subject.name}` : kind,
                    formatNumber(rate.weight),
                  ];
                })}
              />
            ) : (
              <p className="mt-4 font-sans text-xs text-bone/60">
                Sem peso cadastrado — a picareta nunca sorteia este item.
              </p>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

/** Mesma conta do jogo: piso de 1 para item que tem valor, 0 para o que não tem. */
function sellPrice(value: number, sellRatio: number): number {
  if (value <= 0) return 0;
  return Math.max(1, Math.floor(value * sellRatio));
}

// ---------------------------------------------------------------------------

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-l border-graphite/40 pl-4">
      <p className="font-mono text-micro uppercase tracking-widest text-graphite">{label}</p>
      <p className="mt-2 font-display text-lg text-bone">{value}</p>
      {hint && <p className="mt-1 font-sans text-xs text-bone/60">{hint}</p>}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-micro uppercase tracking-widest text-graphite">{children}</p>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="mt-4 divide-y divide-graphite/30 border-y border-graphite/30">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[150px_1fr] items-baseline gap-4 py-3">
          <dt className="font-mono text-micro uppercase tracking-widest text-graphite">{k}</dt>
          <dd className="font-mono text-xs text-bone">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Note({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-2 font-sans text-xs text-bone/85">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * O que cada campo decide. Fica no fim porque quem chega já sabe ler a lista;
 * quem não sabe desce uma tela e descobre por que `effectValue` é 30 num item
 * e 1,5 em outro.
 */
function Legend({ economy }: { economy: Economy }) {
  const ratio = economy ? formatNumber(economy.sellRatio, 2) : "sellRatio";

  return (
    <section className="border-t border-graphite/40 pt-8">
      <Eyebrow>o que está definido para um item</Eyebrow>
      <dl className="mt-6 divide-y divide-graphite/30 border-y border-graphite/30">
        <LegendRow term="categoria">
          Decide comportamento, não vitrine. O export do jogo filtra{" "}
          <Mono>mineral</Mono> nesta coluna para montar a tabela da picareta, e item de
          comerciante fora dela nunca entra no sorteio.
        </LegendRow>
        <LegendRow term="efeito descrito">
          Prosa para humano. O jogo não lê este campo — quando ele diz “recupera parte do
          vigor”, quem diz quanto é o par código/valor de efeito abaixo.
        </LegendRow>
        <LegendRow term="aquisição e notas">
          Editorial: de onde o item sai no mundo e o que ele significa no lore.
        </LegendRow>
        <LegendRow term="preço de compra">
          <Mono>item_stats.value</Mono>, na moeda de <Mono>economy_rules</Mono>. É o preço
          base; um comerciante pode cobrar outro.
        </LegendRow>
        <LegendRow term="o comerciante paga">
          Derivado, não cadastrado: <Mono>max(1, floor(value × {ratio}))</Mono>. O piso de 1
          existe para mineral barato não virar lixo que nunca sai do inventário, e a razão
          é travada abaixo de 1 no banco — em 1,0 o jogador lucraria comprando e revendendo
          em laço.
        </LegendRow>
        <LegendRow term="código de efeito">
          O switch que o Godot roda ao usar o item. <Mono>none</Mono> é mercadoria pura.
        </LegendRow>
        <LegendRow term="valor do efeito">
          Uma coluna só, e a unidade muda com o código ao lado: multiplicador cru em bônus
          de captura (1,5), pontos de vigor em cura fixa, pontos percentuais em cura
          proporcional (30 = 30 % do máximo). Ler o número sem o código dá um valor
          plausível e errado.
        </LegendRow>
        <LegendRow term="onde se compra">
          Junção comerciante × item. Preço nulo cobra o preço base — é o que permite um
          segundo vilarejo mais caro custar dado em vez de código.
        </LegendRow>
        <LegendRow term="peso na mineração">
          Peso bruto, não chance. A picareta sorteia por{" "}
          <Mono>normalizar(peso_classe × peso_bioma)</Mono>: o bioma diz o que o chão tem, a
          classe da criatura ativa diz o que ela sabe achar. Lado ausente por inteiro é
          neutro; lado presente que não lista o mineral zera a chance.
        </LegendRow>
      </dl>
      <p className="mt-6 font-sans text-xs text-bone/60">
        Nenhum destes números vive em código — todos vêm do banco e chegam ao jogo pelo
        bundle exportado. Ajustar é um <Mono>PATCH</Mono> versionado. A especificação em
        prosa está em{" "}
        <Link to="/documents/mineracao" className="text-bone underline underline-offset-2">
          mineração
        </Link>{" "}
        e{" "}
        <Link to="/documents/captura" className="text-bone underline underline-offset-2">
          captura
        </Link>
        .
      </p>
    </section>
  );
}

function LegendRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 py-4 md:grid-cols-[190px_1fr] md:gap-6">
      <dt className="font-mono text-micro uppercase tracking-widest text-graphite">{term}</dt>
      <dd className="font-sans text-xs text-bone/85">{children}</dd>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-xs text-bone">{children}</code>;
}
