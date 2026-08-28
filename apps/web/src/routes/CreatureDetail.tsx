import { Link, useParams } from "react-router-dom";
import { CreatureViewer } from "../components/CreatureViewer";
import { ModelLinkDialog } from "../components/ModelLinkDialog";
import {
  useAbilities,
  useAbilityStats,
  useAwakeningByCreature,
  useBiomes,
  useCaptureRule,
  useCombatRules,
  useCreature,
  useCreatureAbilityLinks,
  useCreatureClasses,
  useCreatureStats,
  useDrops,
  useElementalAdvantages,
  useElements,
  useItems,
  useMapBiomes,
  useMaps,
  useMiningRates,
  useProgressionRules,
  useRelicRules,
  useRelicStats,
  useRelics,
} from "../hooks/useApi";
import { cn } from "../lib/cn";
import {
  ABILITY_EFFECT_LABEL,
  type AbilityEffect,
  AWAKENING_TYPE_LABEL,
  ERA_LABEL,
  PRIMARY_STAT_LABEL,
  type PrimaryStat,
  effectiveStat,
  formatNumber,
  parseWorkFunction,
  plural,
  primaryStatLabel,
  speedModifierSummary,
  workRoleLabel,
} from "../lib/labels";

/**
 * A ficha de criatura — onde o plano visual gasta o orçamento, e o único
 * lugar do site que junta as sete tabelas que descrevem uma criatura.
 *
 * A divisão de leitura é sempre a mesma e é o que dá sentido à página:
 * `creatures` é editorial (o que a coisa é), e stats, captura, habilidades,
 * drops e mineração são o que o Godot executa. Mostrar só o primeiro é o que
 * faz alguém ler "inicial blindado e lento" sem saber que isso são 55 de
 * defesa e 25 de velocidade — e que 25 é o piso do elenco inteiro.
 *
 * Por isso as barras são medidas contra o teto do elenco, não contra um
 * máximo escolhido em código, e por isso toda conta derivada aparece com a
 * fórmula ao lado. Tabela ausente é dita em voz alta em vez de virar linha
 * vazia: a ausência é o próprio pendente.
 *
 * Elementos de assinatura:
 *   - número herói (CRT-001) como âncora, mono XL
 *   - escala fóssil vertical `moss` à esquerda, evocando a barra de
 *     referência ao lado de um espécime
 *   - comparador lado a lado: forma base vs Despertar, com um único acento
 *     ember no chip de tipo
 */
export function CreatureDetail() {
  const { code } = useParams<{ code: string }>();
  const creature = useCreature(code);
  const awakening = useAwakeningByCreature(code);
  const classes = useCreatureClasses();
  const elements = useElements();
  const maps = useMaps();
  const biomes = useBiomes();
  const mapBiomeLinks = useMapBiomes();

  const allStats = useCreatureStats();
  const capture = useCaptureRule(code);
  const abilityLinks = useCreatureAbilityLinks(code);
  const abilities = useAbilities();
  const abilityStats = useAbilityStats();
  const drops = useDrops(code);
  const items = useItems();
  const rates = useMiningRates();
  const advantages = useElementalAdvantages();
  const combat = useCombatRules();
  const progression = useProgressionRules();
  const relics = useRelics();
  const relicStats = useRelicStats();
  const relicRules = useRelicRules();

  if (creature.isLoading)
    return <p className="font-mono text-xs text-graphite">carregando…</p>;
  if (creature.error)
    return <p className="font-mono text-xs text-ember">{String(creature.error)}</p>;
  if (!creature.data) return null;
  const c = creature.data;

  const cls = classes.data?.find((x) => x.id === c.classId);
  const ele = elements.data?.find((x) => x.id === c.elementId);
  const map = maps.data?.find((x) => x.id === c.mapId);
  const biome = biomes.data?.find((x) => x.id === c.biomeId);

  const stat = allStats.data?.find((s) => s.creatureId === c.id);

  // Os biomas onde esta criatura pode ser posta para minerar sao os do mapa
  // dela, na ordem em que `map_biomes` os lista.
  const mapBiomes = (mapBiomeLinks.data ?? [])
    .filter((l) => map != null && l.mapId === map.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => biomes.data?.find((b) => b.id === l.biomeId))
    .filter((b): b is Biome => b != null);

  return (
    <div>
      <Link
        to="/bestiary"
        className="mb-8 inline-block font-mono text-micro tracking-widest text-graphite hover:text-bone"
      >
        ← BESTIÁRIO
      </Link>

      {/* HERO — the single big visual moment on the site */}
      <section className="grid grid-cols-[24px_1fr] items-start gap-6 md:gap-10">
        <div className="fossil-scale h-full min-h-[160px] w-px justify-self-center opacity-70" />
        <div>
          <p className="font-mono text-micro uppercase tracking-widest text-graphite">
            espécime
          </p>
          <h1
            className="mt-1 font-display font-bold text-ember"
            style={{
              fontSize: "clamp(64px,13vw,128px)",
              lineHeight: 0.95,
              letterSpacing: "-0.04em",
            }}
          >
            {c.code}
          </h1>
          <p className="mt-4 font-display text-xl text-bone">{c.originalName}</p>
          {c.baseSpecies && (
            <p className="mt-1 font-sans text-xs italic text-bone/60">{c.baseSpecies}</p>
          )}
        </div>
      </section>

      {/* 3D turntable — the only place camera rotation is allowed (see camera-e-perspectiva doc) */}
      <section className="mt-12">
        <CreatureViewer url={c.modelUrl} />
        <ModelLinkDialog creatureCode={c.code} currentUrl={c.modelUrl} />
      </section>

      {/* comparator */}
      <section className="mt-14 grid grid-cols-1 gap-px border-y border-graphite/40 bg-graphite/30 md:grid-cols-2">
        <FormPanel
          eyebrow="forma base"
          title={c.originalName}
          rows={[
            // A classe traz a especializacao junto: e o que ela significa
            // desde que deixou de ser linhagem, e o nome sozinho e ficcional.
            [
              "classe",
              cls ? `${cls.code} · ${cls.name} — ${primaryStatLabel(cls.primaryStat)} +${cls.primaryStatBonusPct}%` : "—",
            ],
            ["elemento", ele ? `${ele.code} · ${ele.name}` : "—"],
            ["era", map?.era ? ERA_LABEL[map.era] : "—"],
            ["mapa", map ? `${map.code} · ${map.name}` : "—"],
            // `biome_id` nao viaja no bundle: o bioma que decide a mineracao e
            // aquele onde a criatura for posta para trabalhar, nao este.
            [
              "bioma",
              biome ? `${biome.code} · ${biome.name} — anotação de catálogo` : "—",
            ],
            ["papel", c.role ?? "—"],
            ["status", c.status ?? "—"],
          ]}
          note={c.silhouetteNote ?? null}
          noteLabel="silhueta"
        />
        {awakening.data ? (
          <FormPanel
            eyebrow="despertar ancestral"
            title={awakening.data.name}
            code={awakening.data.code}
            rows={[
              [
                "tipo",
                <TypeChip
                  key="type"
                  type={awakening.data.type}
                  chance={awakening.data.activationChancePct}
                />,
              ],
              ["espécie de referência", awakening.data.referenceSpecies ?? "—"],
              // O multiplicador e a duracao moram em `creature_stats`, nao na
              // linha do despertar — mas e aqui que eles significam algo.
              [
                "multiplicador",
                stat ? `×${formatNumber(stat.awakeningMultiplier)} nos stats` : "—",
              ],
              [
                "duração",
                stat
                  ? `${stat.awakeningDurationTurns} ${plural(stat.awakeningDurationTurns, "turno")}`
                  : "—",
              ],
            ]}
            note={awakening.data.visualChanges ?? awakening.data.notes ?? null}
            noteLabel="mudanças visuais"
          />
        ) : (
          <div className="bg-void p-6 md:p-8">
            <p className="font-mono text-micro uppercase tracking-widest text-graphite">
              despertar ancestral
            </p>
            <p className="mt-6 font-display text-lg text-bone/40">não cadastrado</p>
            <p className="mt-2 font-sans text-xs text-bone/50">
              Esta criatura não tem despertar registrado. A ausência de linha significa
              que o design ainda está em aberto.
            </p>
          </div>
        )}
      </section>

      <StatsSection
        stat={stat}
        allStats={allStats.data ?? []}
        cls={cls}
        levelMax={combat.data?.levelMax ?? null}
        xpYieldDivisor={progression.data?.xpYieldDivisor ?? null}
        loading={allStats.isLoading}
      />

      <AbilitiesSection
        links={abilityLinks.data ?? []}
        abilities={abilities.data ?? []}
        abilityStats={abilityStats.data ?? []}
        elements={elements.data ?? []}
        loading={abilityLinks.isLoading}
      />

      <CaptureSection
        rule={capture.data ?? null}
        creatureElementId={c.elementId}
        creatureClassId={c.classId}
        relics={relics.data ?? []}
        relicStats={relicStats.data ?? []}
        rules={relicRules.data}
        advantages={advantages.data ?? []}
        elements={elements.data ?? []}
        classes={classes.data ?? []}
        loading={capture.isLoading}
      />

      <MiningSection
        cls={cls}
        map={map}
        mapBiomes={mapBiomes}
        rates={rates.data ?? []}
        items={items.data ?? []}
        loading={rates.isLoading || items.isLoading}
      />

      <DropsSection
        drops={drops.data ?? []}
        items={items.data ?? []}
        className={cls?.name}
        loading={drops.isLoading}
      />

      <MatchupSection
        element={ele}
        elements={elements.data ?? []}
        advantages={advantages.data ?? []}
        neutral={combat.data?.elementNeutralMultiplier ?? 1}
      />

      <Legend />
    </div>
  );
}

// ---------------------------------------------------------------------------
// tipos locais, derivados dos hooks — mesma convenção da tela de itens

type CreatureClass = NonNullable<ReturnType<typeof useCreatureClasses>["data"]>[number];
type Element = NonNullable<ReturnType<typeof useElements>["data"]>[number];
type Biome = NonNullable<ReturnType<typeof useBiomes>["data"]>[number];
type GameMap = NonNullable<ReturnType<typeof useMaps>["data"]>[number];
type Item = NonNullable<ReturnType<typeof useItems>["data"]>[number];
type Stat = NonNullable<ReturnType<typeof useCreatureStats>["data"]>[number];
type CaptureRule = NonNullable<ReturnType<typeof useCaptureRule>["data"]>;
type AbilityLink = NonNullable<ReturnType<typeof useCreatureAbilityLinks>["data"]>[number];
type Ability = NonNullable<ReturnType<typeof useAbilities>["data"]>[number];
type AbilityStat = NonNullable<ReturnType<typeof useAbilityStats>["data"]>[number];
type Drop = NonNullable<ReturnType<typeof useDrops>["data"]>[number];
type Rate = NonNullable<ReturnType<typeof useMiningRates>["data"]>[number];
type Advantage = NonNullable<ReturnType<typeof useElementalAdvantages>["data"]>[number];
type Relic = NonNullable<ReturnType<typeof useRelics>["data"]>[number];
type RelicStat = NonNullable<ReturnType<typeof useRelicStats>["data"]>[number];
type RelicRules = ReturnType<typeof useRelicRules>["data"];

/** As cinco colunas de stat, na ordem em que o jogo as lê. */
const STAT_KEYS: { key: PrimaryStat; column: keyof Stat }[] = [
  { key: "hp", column: "baseHp" },
  { key: "attack", column: "baseAttack" },
  { key: "defense", column: "baseDefense" },
  { key: "speed", column: "baseSpeed" },
  { key: "charge", column: "baseCharge" },
];

// ---------------------------------------------------------------------------

interface StatsSectionProps {
  stat: Stat | undefined;
  allStats: Stat[];
  cls: CreatureClass | undefined;
  levelMax: number | null;
  xpYieldDivisor: number | null;
  loading: boolean;
}

/**
 * Os cinco stats base, medidos contra o elenco.
 *
 * Uma barra precisa de escala, e a escala honesta aqui é o maior valor que
 * aquele stat atingiu em qualquer criatura cadastrada — assim a barra
 * responde "onde essa criatura está no elenco", que é a pergunta real, em vez
 * de responder contra um 100 arbitrário que ninguém definiu em lugar nenhum.
 */
function StatsSection({
  stat,
  allStats,
  cls,
  levelMax,
  xpYieldDivisor,
  loading,
}: StatsSectionProps) {
  if (loading) {
    return (
      <Section title="Stats base" eyebrow="creature_stats">
        <p className="mt-4 font-mono text-xs text-graphite">carregando…</p>
      </Section>
    );
  }

  if (!stat) {
    return (
      <Section title="Stats base" eyebrow="creature_stats">
        <Missing table="creature_stats">
          A criatura existe no catálogo e o jogo não sabe quanto ela tem de HP, de ataque
          nem quanto XP ela vale ao ser derrotada. Sem esta linha ela não entra em
          combate — o export do bundle recusa a criatura.
        </Missing>
      </Section>
    );
  }

  const total = STAT_KEYS.reduce((sum, s) => sum + (stat[s.column] as number), 0);
  const level = levelMax ?? 50;

  return (
    <Section title="Stats base" eyebrow="creature_stats">
      <p className="mt-2 max-w-2xl font-sans text-xs text-bone/70">
        Valores no nível 1. A barra mede cada stat contra o maior valor que aquele stat
        atinge em todo o elenco cadastrado — é a escala que responde “alto para quem”.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-[1.3fr_1fr]">
        <div>
          <ul className="space-y-5">
            {STAT_KEYS.map(({ key, column }) => {
              const value = stat[column] as number;
              const castMax = Math.max(
                ...allStats.map((s) => s[column] as number),
                value,
              );
              const isPrimary = cls?.primaryStat === key;
              const bonus = isPrimary ? cls.primaryStatBonusPct : 0;
              return (
                <li key={key}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span
                      className={cn(
                        "font-mono text-micro uppercase tracking-widest",
                        isPrimary ? "text-ember" : "text-graphite",
                      )}
                    >
                      {PRIMARY_STAT_LABEL[key]}
                      {isPrimary && (
                        <span className="ml-2 normal-case tracking-normal text-ember/80">
                          especialidade da classe · +{cls.primaryStatBonusPct}%
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-bone">
                      {value}
                      <span className="text-graphite">
                        {" "}
                        → {effectiveStat(value, stat.growthRate, level, bonus)} no nv.{" "}
                        {level}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 h-1 w-full bg-graphite/30">
                    <div
                      className={cn("h-full", isPrimary ? "bg-ember" : "bg-moss")}
                      style={{ width: `${(value / castMax) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 font-mono text-micro uppercase tracking-widest text-graphite">
            soma dos cinco · <span className="text-bone">{total}</span>
          </p>
        </div>

        <div>
          <Eyebrow>o que se deriva daí</Eyebrow>
          <Rows
            rows={[
              [
                "crescimento",
                `${formatNumber(stat.growthRate, 3)} por nível · floor(base × (1 + taxa × (nível − 1)))`,
              ],
              [
                "xp que concede",
                xpYieldDivisor
                  ? `${stat.xpYield} · derrotá-la no nv. ${level} dá ${Math.floor(
                      (stat.xpYield * level) / xpYieldDivisor,
                    )} XP`
                  : `${stat.xpYield}`,
              ],
              [
                "tamanho em cena",
                `${formatNumber(stat.sizeMeters)} un. Godot${
                  stat.realSizeMeters !== null
                    ? ` · ${formatNumber(stat.realSizeMeters)} m reais`
                    : " · tamanho real não pesquisado"
                }`,
              ],
              [
                "despertar",
                `×${formatNumber(stat.awakeningMultiplier)} por ${
                  stat.awakeningDurationTurns
                } ${plural(stat.awakeningDurationTurns, "turno")}`,
              ],
            ]}
          />
          {stat.notes && <Note label="notas de balanceamento">{stat.notes}</Note>}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------

interface AbilitiesSectionProps {
  links: AbilityLink[];
  abilities: Ability[];
  abilityStats: AbilityStat[];
  elements: Element[];
  loading: boolean;
}

/**
 * O repertório, na ordem em que a criatura o aprende.
 *
 * `creature_abilities` diz só o par criatura×habilidade e o nível; o que o
 * golpe faz está em `abilities` (prosa) e em `ability_stats` (números). A
 * linha junta os três porque separados eles não respondem nada — "Brasa,
 * nível 1" não diz se vale a pena, "poder 40, precisão 100%" não diz de quem
 * é nem quando chega.
 */
function AbilitiesSection({
  links,
  abilities,
  abilityStats,
  elements,
  loading,
}: AbilitiesSectionProps) {
  const abilityById = new Map(abilities.map((a) => [a.id, a]));
  const statByAbility = new Map(abilityStats.map((s) => [s.abilityId, s]));
  const elementById = new Map(elements.map((e) => [e.id, e]));

  const rows = [...links].sort(
    (a, b) => a.learnLevel - b.learnLevel || a.sortOrder - b.sortOrder,
  );

  return (
    <Section title="Habilidades" eyebrow="creature_abilities × abilities × ability_stats">
      {loading ? (
        <p className="mt-4 font-mono text-xs text-graphite">carregando…</p>
      ) : rows.length === 0 ? (
        <Missing table="creature_abilities">
          A criatura não conhece nenhum golpe. Em combate ela não teria o que fazer no
          próprio turno — o export do bundle recusa a criatura por isso.
        </Missing>
      ) : (
        <>
          <p className="mt-2 max-w-2xl font-sans text-xs text-bone/70">
            {rows.length} {plural(rows.length, "golpe")}, na ordem de aprendizado. Poder 0
            é movimento de status: não causa dano, executa o efeito da última coluna.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-y border-graphite/40 text-left">
                  {["nv.", "código", "golpe", "elemento", "poder", "precisão", "usos", "efeito"].map(
                    (h) => (
                      <th
                        key={h}
                        className="py-3 pr-4 font-mono text-micro font-normal uppercase tracking-widest text-graphite"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((link) => {
                  const ability = abilityById.get(link.abilityId);
                  const s = statByAbility.get(link.abilityId);
                  const element =
                    ability?.elementId != null ? elementById.get(ability.elementId) : null;
                  return (
                    <tr
                      key={link.id}
                      className="border-b border-graphite/30 last:border-b-0"
                    >
                      <td className="py-3 pr-4 font-mono text-xs text-ember">
                        {link.learnLevel}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-bone/70">
                        {ability?.code ?? `#${link.abilityId}`}
                      </td>
                      <td className="py-3 pr-4 font-sans text-xs text-bone">
                        {ability?.name ?? "—"}
                        {ability?.awakeningOnly && (
                          <span className="ml-2 font-mono text-micro uppercase tracking-widest text-ember">
                            só no despertar
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-bone/70">
                        {element ? element.name : "neutro"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-bone">
                        {s ? (s.power === 0 ? "—" : s.power) : "?"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-bone/70">
                        {s ? `${s.accuracy}%` : "?"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-bone/70">
                        {s ? s.uses : "?"}
                      </td>
                      <td className="py-3 pr-4 font-sans text-xs text-bone/85">
                        {s ? (
                          <>
                            {ABILITY_EFFECT_LABEL[s.effectCode as AbilityEffect] ??
                              s.effectCode}
                            {s.effectValue !== 0 && ` · ${formatNumber(s.effectValue)}`}
                            {s.targetSelf && " · em si mesma"}
                            {s.priority !== 0 && ` · prioridade ${s.priority}`}
                          </>
                        ) : (
                          <span className="text-bone/50">sem linha em ability_stats</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

interface CaptureSectionProps {
  rule: CaptureRule | null;
  creatureElementId: number;
  creatureClassId: number;
  relics: Relic[];
  relicStats: RelicStat[];
  rules: RelicRules;
  advantages: Advantage[];
  elements: Element[];
  classes: CreatureClass[];
  loading: boolean;
}

/**
 * `catchRate` sozinho não responde "é difícil de pegar?".
 *
 * Desde o sistema de Relicário a fórmula lê o campo invertido
 * (`resistência = 256 − catchRate`) e divide por ela a taxa do relicário
 * usado — ou seja, a dificuldade só existe em relação a um relicário. Por
 * isso a tabela abaixo roda a conta para cada modelo cadastrado em vez de
 * mostrar o número cru e deixar a leitura por conta de quem vê.
 */
function CaptureSection({
  rule,
  creatureElementId,
  creatureClassId,
  relics,
  relicStats,
  rules,
  advantages,
  elements,
  classes,
  loading,
}: CaptureSectionProps) {
  if (loading) {
    return (
      <Section title="Captura" eyebrow="capture_rules">
        <p className="mt-4 font-mono text-xs text-graphite">carregando…</p>
      </Section>
    );
  }

  if (!rule) {
    return (
      <Section title="Captura" eyebrow="capture_rules">
        <Missing table="capture_rules">
          Sem resistência definida, nenhum relicário sabe que conta fazer contra esta
          criatura. O export do bundle recusa a criatura por isso.
        </Missing>
      </Section>
    );
  }

  const resistance = 256 - rule.catchRate;
  const statByRelic = new Map(relicStats.map((s) => [s.relicId, s]));
  const elementById = new Map(elements.map((e) => [e.id, e]));
  const classById = new Map(classes.map((x) => [x.id, x]));

  /** `final% = clamp(base% + mesmo elemento + mesma classe − desvantagem)`. */
  const chanceFor = (relic: Relic, relicStat: RelicStat, level: number) => {
    if (!rules) return null;
    const relicRate =
      relicStat.baseCaptureRate + (level - 1) * relicStat.captureRatePerLevel;
    const basePct = (relicRate / resistance) * 100;
    const sameElement = relic.elementId != null && relic.elementId === creatureElementId;
    const sameClass = relic.classId != null && relic.classId === creatureClassId;
    const disadvantage =
      relic.elementId != null &&
      advantages.some(
        (a) =>
          a.attackerElementId === relic.elementId &&
          a.defenderElementId === creatureElementId &&
          a.multiplier < 1,
      );
    const raw =
      basePct +
      (sameElement ? rules.sameElementBonusPct : 0) +
      (sameClass ? rules.sameClassBonusPct : 0) -
      (disadvantage ? rules.elementDisadvantagePenaltyPct : 0);
    return {
      pct: Math.min(Math.max(raw, rules.captureFloorPct), rules.captureCeilPct),
      sameElement,
      sameClass,
      disadvantage,
    };
  };

  return (
    <Section title="Captura" eyebrow="capture_rules + relic_stats + relic_rules">
      <div className="mt-6 grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-[1fr_1.4fr]">
        <div>
          <Rows
            rows={[
              ["catchRate", `${rule.catchRate} de 255 · maior é mais fácil`],
              ["resistência", `${resistance} · 256 − catchRate`],
              [
                "multiplicador no despertar",
                `${formatNumber(rule.awakenedMultiplier)} · vestigial`,
              ],
            ]}
          />
          <p className="mt-4 font-sans text-xs text-bone/60">
            O multiplicador de despertar ficou no schema mas a fórmula do Relicário não
            tem termo de Despertar — mudar esse número hoje não muda nada em jogo.
          </p>
          {rule.notes && <Note label="notas">{rule.notes}</Note>}
        </div>

        <div>
          <Eyebrow>chance por relicário</Eyebrow>
          {relics.length === 0 || !rules ? (
            <p className="mt-4 font-sans text-xs text-bone/60">
              Nenhum modelo de relicário cadastrado — não há com o que calcular.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="border-y border-graphite/40 text-left">
                    {["relicário", "afinidade", "nível 1", "nível máx."].map((h) => (
                      <th
                        key={h}
                        className="py-3 pr-4 font-mono text-micro font-normal uppercase tracking-widest text-graphite"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {relics.map((relic) => {
                    const rs = statByRelic.get(relic.id);
                    const low = rs ? chanceFor(relic, rs, 1) : null;
                    const high = rs ? chanceFor(relic, rs, rs.maxLevel) : null;
                    const affinity = [
                      relic.elementId != null
                        ? elementById.get(relic.elementId)?.name
                        : null,
                      relic.classId != null ? classById.get(relic.classId)?.name : null,
                    ].filter(Boolean);
                    return (
                      <tr
                        key={relic.code}
                        className="border-b border-graphite/30 last:border-b-0"
                      >
                        <td className="py-3 pr-4 font-mono text-xs text-bone">
                          {relic.code}
                          <span className="ml-2 font-sans text-bone/60">{relic.name}</span>
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-bone/70">
                          {affinity.length ? affinity.join(" · ") : "neutro"}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs">
                          <ChancePct result={low} />
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs">
                          <ChancePct result={high} />
                          {rs && (
                            <span className="ml-1 text-graphite">nv. {rs.maxLevel}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rules && (
            <p className="mt-4 font-sans text-xs text-bone/60">
              Piso {rules.captureFloorPct}% e teto {rules.captureCeilPct}%. Mesmo elemento
              soma {rules.sameElementBonusPct} pontos, mesma classe soma{" "}
              {rules.sameClassBonusPct}, e um relicário em desvantagem elemental perde{" "}
              {rules.elementDisadvantagePenaltyPct}.
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

function ChancePct({
  result,
}: {
  result: {
    pct: number;
    sameElement: boolean;
    sameClass: boolean;
    disadvantage: boolean;
  } | null;
}) {
  if (!result) return <span className="text-bone/50">sem stats</span>;
  const marks = [
    result.sameElement ? "+elem" : null,
    result.sameClass ? "+classe" : null,
    result.disadvantage ? "−desv" : null,
  ].filter(Boolean);
  return (
    <>
      <span className={result.pct >= 60 ? "text-moss" : "text-bone"}>
        {formatNumber(result.pct, 0)}%
      </span>
      {marks.length > 0 && (
        <span className="ml-2 text-micro text-graphite">{marks.join(" ")}</span>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

interface MiningSectionProps {
  cls: CreatureClass | undefined;
  map: GameMap | undefined;
  mapBiomes: Biome[];
  rates: Rate[];
  items: Item[];
  loading: boolean;
}

/**
 * A tabela da picareta desta criatura, uma coluna por bioma onde ela pode
 * cavar.
 *
 * Uma coluna só seria mentira. O bioma que entra na fórmula é aquele **em que
 * a criatura está** quando trabalha, não um bioma que ela carrega: o export
 * nem manda `creatures.biome_id` no bundle, manda o mapa. Então a pergunta
 * honesta não é "o que ela minera", é "o que ela minera em cada chão do mapa
 * dela" — e a resposta é uma matriz.
 *
 * O peso cru de `mining_rates` também não é chance: o jogo multiplica classe
 * por bioma e normaliza. Cada lado tem uma armadilha silenciosa — lado
 * ausente por inteiro é neutro, lado presente que não lista o minério zera a
 * chance dele. Colunas idênticas aqui são exatamente o sintoma da primeira, e
 * é para isso que os biomas descobertos vêm marcados no cabeçalho.
 */
function MiningSection({ cls, map, mapBiomes, rates, items, loading }: MiningSectionProps) {
  const work = parseWorkFunction(cls?.workFunction);
  const ores = items.filter((i) => i.category === "mineral");

  const classRows = cls ? rates.filter((r) => r.classId === cls.id) : [];
  const classNeutral = classRows.length === 0;
  const classWeight = new Map(classRows.map((r) => [r.itemId, r.weight]));

  /** `normalizar(peso_classe × peso_bioma)` para um bioma — ou só a classe. */
  const column = (biome: Biome | null) => {
    const biomeRows = biome ? rates.filter((r) => r.biomeId === biome.id) : [];
    const biomeNeutral = biomeRows.length === 0;
    const biomeWeight = new Map(biomeRows.map((r) => [r.itemId, r.weight]));
    const products = ores.map((ore) => {
      const cw = classNeutral ? 1 : (classWeight.get(ore.id) ?? 0);
      const bw = biomeNeutral ? 1 : (biomeWeight.get(ore.id) ?? 0);
      return cw * bw;
    });
    const sum = products.reduce((s, p) => s + p, 0);
    const chances = products.map((p) => (sum > 0 ? p / sum : 0));
    return { biome, biomeNeutral, chances, best: Math.max(...chances, 0) };
  };

  // Sem mapa (reserva fora de composição) ou mapa sem biomas ligados: resta a
  // coluna da classe sozinha, que é o que o jogo faria de qualquer forma.
  const columns = mapBiomes.length > 0 ? mapBiomes.map((b) => column(b)) : [column(null)];
  const uncovered = columns.filter((col) => col.biome && col.biomeNeutral).length;

  return (
    <Section title="Mineração" eyebrow="creature_classes.workFunction + mining_rates">
      <p className="mt-2 max-w-2xl font-sans text-xs text-bone/70">
        A chance é <Mono>normalizar(peso_classe × peso_bioma)</Mono>, e o bioma que conta é
        aquele onde a criatura for posta para trabalhar — por isso há uma coluna por bioma
        de {map ? map.name : "seu mapa"}, não um número só.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-[1fr_1.7fr]">
        <div>
          <Eyebrow>como ela trabalha</Eyebrow>
          <Rows
            rows={[
              ["classe", cls ? `${cls.code} · ${cls.name}` : "—"],
              ["papel", workRoleLabel(work?.role)],
              ["ritmo", speedModifierSummary(work?.speedModifier)],
              [
                "onde pode cavar",
                mapBiomes.length
                  ? `${mapBiomes.length} ${plural(mapBiomes.length, "bioma")} em ${map?.code}`
                  : "nenhum bioma ligado ao mapa",
              ],
            ]}
          />
          <p className="mt-4 font-sans text-xs text-bone/60">
            O papel e o ritmo vêm da classe, não da criatura: duas criaturas de classes
            diferentes no mesmo bioma mineram coisas diferentes, e é essa a única
            consequência de gameplay que a classe tem fora do bônus de stat.
          </p>
        </div>

        <div>
          <Eyebrow>o que a picareta sorteia</Eyebrow>
          {loading ? (
            <p className="mt-4 font-mono text-xs text-graphite">carregando…</p>
          ) : ores.length === 0 ? (
            <p className="mt-4 font-sans text-xs text-bone/60">
              Nenhum item na categoria mineral — não há o que sortear.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-y border-graphite/40 text-left">
                    <th className="py-3 pr-4 font-mono text-micro font-normal uppercase tracking-widest text-graphite">
                      minério
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col.biome?.code ?? "classe"}
                        className="py-3 pr-4 text-right font-mono text-micro font-normal uppercase tracking-widest text-graphite"
                      >
                        {col.biome ? col.biome.name : "só a classe"}
                        {col.biome && col.biomeNeutral && (
                          <span className="block normal-case tracking-normal text-ember/80">
                            sem taxas
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ores.map((ore, i) => (
                    <tr key={ore.code} className="border-b border-graphite/30 last:border-b-0">
                      <td className="py-2.5 pr-4 font-sans text-xs text-bone">
                        {ore.name}
                        {!classNeutral && (
                          <span className="ml-2 font-mono text-micro text-graphite">
                            classe {formatNumber(classWeight.get(ore.id) ?? 0)}
                          </span>
                        )}
                      </td>
                      {columns.map((col) => {
                        const chance = col.chances[i] ?? 0;
                        return (
                          <td
                            key={col.biome?.code ?? "classe"}
                            className={cn(
                              "py-2.5 pr-4 text-right font-mono text-xs",
                              chance === 0
                                ? "text-graphite"
                                : chance === col.best
                                  ? "text-moss"
                                  : "text-bone",
                            )}
                          >
                            {formatNumber(chance * 100, 1)}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 font-sans text-xs text-bone/60">
            {classNeutral
              ? "A classe não tem pesos cadastrados — esse lado é neutro e só o bioma decide."
              : uncovered === 0 && columns.some((col) => col.biome)
                ? "Todos os biomas do mapa têm taxas: cada coluna é uma tabela de fato diferente."
                : uncovered > 0
                  ? `${uncovered} ${plural(uncovered, "bioma")} do mapa ${plural(uncovered, "está", "estão")} sem taxas. ${plural(uncovered, "Essa coluna repete", "Essas colunas repetem")} o perfil da classe — não é o comportamento pretendido, é o lado do bioma desligado em silêncio.`
                  : "Sem bioma ligado ao mapa, o resultado é o perfil cru da classe."}
          </p>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------

interface DropsSectionProps {
  drops: Drop[];
  items: Item[];
  className: string | undefined;
  loading: boolean;
}

function DropsSection({ drops, items, className, loading }: DropsSectionProps) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const hasMaterial = drops.some((d) => itemById.get(d.itemId)?.category === "material");

  return (
    <Section title="O que ela deixa cair" eyebrow="drops">
      {loading ? (
        <p className="mt-4 font-mono text-xs text-graphite">carregando…</p>
      ) : drops.length === 0 ? (
        <Missing table="drops">
          Derrotar esta criatura não rende nada. Como é a classe do derrotado que decide
          qual material de progressão cai, a ausência aqui tira do jogo uma das fontes do
          material de {className ?? "sua classe"}.
        </Missing>
      ) : (
        <>
          {/* Lista própria em vez de `Rows`: a chave natural de `drops` inclui
              a condição, então o mesmo item pode aparecer duas vezes com
              condições diferentes e o rótulo sozinho não identifica a linha. */}
          <dl className="mt-4 divide-y divide-graphite/30 border-y border-graphite/30">
            {drops.map((d) => {
              const item = itemById.get(d.itemId);
              return (
                <div
                  key={d.id}
                  className="grid grid-cols-[150px_1fr] items-baseline gap-4 py-3"
                >
                  <dt className="font-mono text-micro uppercase tracking-widest text-graphite">
                    {item ? item.code : `item #${d.itemId}`}
                  </dt>
                  <dd className="font-mono text-xs text-bone">
                    {item?.name ?? "—"}
                    <span className="text-graphite">
                      {" · "}
                      {formatNumber(d.chance * 100, 0)}%
                      {d.condition ? ` · ${d.condition}` : ""}
                    </span>
                    {item?.category === "material" && (
                      <span className="ml-2 text-ember">material de progressão</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          {!hasMaterial && (
            <p className="mt-4 font-sans text-xs text-bone/60">
              Nenhum dos drops é material de progressão. Vale conferir se é intencional: o
              material da classe do derrotado é o que sustenta a subida de nível.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

interface MatchupSectionProps {
  element: Element | undefined;
  elements: Element[];
  advantages: Advantage[];
  neutral: number;
}

/**
 * O anel elemental visto do ponto desta criatura, nas duas direções.
 *
 * O mesmo `0,5` significa coisas opostas dependendo de quem ataca, e essa é a
 * confusão que a tabela crua de `elemental_advantages` cria. Aqui cada lado
 * ganha uma frase própria em vez de uma coluna de multiplicadores.
 */
function MatchupSection({ element, elements, advantages, neutral }: MatchupSectionProps) {
  if (!element) return null;
  const byId = new Map(elements.map((e) => [e.id, e]));

  const attacking = advantages.filter((a) => a.attackerElementId === element.id);
  const defending = advantages.filter((a) => a.defenderElementId === element.id);

  return (
    <Section title="Confronto elemental" eyebrow="elemental_advantages">
      <p className="mt-2 max-w-2xl font-sans text-xs text-bone/70">
        Vale para o elemento {element.name}, não para esta criatura em particular — o anel
        é a mesma regra para todo o elenco. Par não listado é neutro (×
        {formatNumber(neutral)}).
      </p>
      <div className="mt-6 grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
        <div>
          <Eyebrow>atacando</Eyebrow>
          <Rows
            rows={
              attacking.length
                ? attacking.map((a) => [
                    `contra ${byId.get(a.defenderElementId)?.name ?? "—"}`,
                    <MultiplierChip key={a.id} multiplier={a.multiplier} good />,
                  ])
                : [["—", "nenhum par cadastrado"]]
            }
          />
        </div>
        <div>
          <Eyebrow>defendendo</Eyebrow>
          <Rows
            rows={
              defending.length
                ? defending.map((a) => [
                    `sofrendo de ${byId.get(a.attackerElementId)?.name ?? "—"}`,
                    <MultiplierChip key={a.id} multiplier={a.multiplier} />,
                  ])
                : [["—", "nenhum par cadastrado"]]
            }
          />
        </div>
      </div>
    </Section>
  );
}

/** `good` inverte a leitura: multiplicador alto é bom para quem ataca, ruim para quem defende. */
function MultiplierChip({ multiplier, good }: { multiplier: number; good?: boolean }) {
  const favourable = good ? multiplier > 1 : multiplier < 1;
  return (
    <span className={favourable ? "text-moss" : "text-ember"}>
      ×{formatNumber(multiplier)}
      <span className="ml-2 text-bone/60">
        {multiplier > 1 ? "dano dobrado" : multiplier < 1 ? "dano pela metade" : "neutro"}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------

interface FormPanelProps {
  eyebrow: string;
  title: string;
  code?: string;
  rows: [string, React.ReactNode][];
  note?: string | null;
  noteLabel?: string;
}

function FormPanel({ eyebrow, title, code, rows, note, noteLabel }: FormPanelProps) {
  return (
    <div className="bg-void p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-mono text-micro uppercase tracking-widest text-graphite">
          {eyebrow}
        </p>
        {code && <p className="font-mono text-xs text-ember">{code}</p>}
      </div>
      <p className="mt-4 font-display text-lg text-bone">{title}</p>
      <dl className="mt-8 divide-y divide-graphite/30 border-y border-graphite/30">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[130px_1fr] items-baseline gap-4 py-3">
            <dt className="font-mono text-micro uppercase tracking-widest text-graphite">
              {k}
            </dt>
            <dd className="font-mono text-xs text-bone">{v}</dd>
          </div>
        ))}
      </dl>
      {note && (
        <div className="mt-6">
          <p className="font-mono text-micro uppercase tracking-widest text-graphite">
            {noteLabel ?? "nota"}
          </p>
          <p className="mt-2 font-sans text-xs text-bone/85">{note}</p>
        </div>
      )}
    </div>
  );
}

function TypeChip({
  type,
  chance,
}: {
  type: "reinforcement" | "swap";
  chance: number | null;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 border px-2 py-0.5 font-mono text-micro uppercase tracking-widest",
        type === "swap" ? "border-ember/60 text-ember" : "border-moss/60 text-moss",
      )}
    >
      {AWAKENING_TYPE_LABEL[type]}
      {chance !== null && <span>· {chance}%</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// peças compartilhadas pelas seções de número

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 border-t border-graphite/40 pt-8">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-display text-xl text-bone">{title}</h2>
        <span className="font-mono text-micro uppercase tracking-widest text-graphite">
          {eyebrow}
        </span>
      </div>
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-micro uppercase tracking-widest text-graphite">
      {children}
    </p>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="mt-4 divide-y divide-graphite/30 border-y border-graphite/30">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[150px_1fr] items-baseline gap-4 py-3">
          <dt className="font-mono text-micro uppercase tracking-widest text-graphite">
            {k}
          </dt>
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

/** Tabela ausente dita em voz alta — a mesma decisão da tela de itens. */
function Missing({ table, children }: { table: string; children: React.ReactNode }) {
  return (
    <p className="mt-4 max-w-2xl font-sans text-xs text-bone/60">
      Sem linha em <code className="font-mono text-bone/80">{table}</code>. {children}
    </p>
  );
}

// ---------------------------------------------------------------------------

/**
 * Fica no fim porque quem chega já sabe ler a ficha; quem não sabe desce uma
 * tela e descobre por que a chance de mineração não é o peso cadastrado.
 */
function Legend() {
  return (
    <section className="mt-16 border-t border-graphite/40 pt-8">
      <Eyebrow>o que está definido para uma criatura</Eyebrow>
      <dl className="mt-6 divide-y divide-graphite/30 border-y border-graphite/30">
        <LegendRow term="stats base">
          Os cinco valores no nível 1. O jogo sobe cada um por{" "}
          <Mono>floor(base × (1 + crescimento × (nível − 1)))</Mono> e multiplica{" "}
          <em>um só deles</em> pelo bônus da classe — nunca os cinco.
        </LegendRow>
        <LegendRow term="especialidade da classe">
          A classe é especialização de gameplay, não linhagem: ela decide qual stat leva o
          bônus e qual material cai. Não existe vantagem de classe contra classe.
        </LegendRow>
        <LegendRow term="xp que concede">
          <Mono>xpYield</Mono> é por espécie. Quem vence ganha{" "}
          <Mono>floor(xpYield × nívelDoAlvo ÷ divisor)</Mono>. Subir de nível também gasta
          o material da própria classe — XP sozinho não basta.
        </LegendRow>
        <LegendRow term="tamanho em cena">
          Derivado, não escolhido: o tamanho real passa por uma curva de compressão
          logarítmica com piso 0,9 e teto 4,5 unidades. O jogador tem 1,8. Ver{" "}
          <DocLink slug="escala-das-criaturas">escala das criaturas</DocLink>.
        </LegendRow>
        <LegendRow term="despertar">
          Multiplicador e duração ficam em <Mono>creature_stats</Mono>, não na linha do
          despertar. O medidor enche com dano sofrido e causado, escalado por Stamina —
          ver <DocLink slug="carga-e-despertar">carga e despertar</DocLink>.
        </LegendRow>
        <LegendRow term="habilidades">
          Três tabelas: o vínculo diz quando se aprende, <Mono>abilities</Mono> diz o que o
          golpe é em prosa e <Mono>ability_stats</Mono> diz os números que o combate roda.
          Poder 0 é movimento de status.
        </LegendRow>
        <LegendRow term="captura">
          <Mono>catchRate</Mono> vai de 1 a 255 e maior é mais fácil, mas a fórmula do
          Relicário o lê invertido: <Mono>resistência = 256 − catchRate</Mono>. A chance só
          existe em relação a um relicário — ver{" "}
          <DocLink slug="relicario">relicário</DocLink> e{" "}
          <DocLink slug="captura">captura</DocLink>.
        </LegendRow>
        <LegendRow term="mineração">
          O peso cadastrado não é chance. A picareta sorteia por{" "}
          <Mono>normalizar(peso_classe × peso_bioma)</Mono>: o bioma diz o que o chão tem,
          a classe da criatura diz o que ela sabe achar. Lado ausente por inteiro é
          neutro; lado presente que não lista o minério zera a chance dele. Ver{" "}
          <DocLink slug="mineracao">mineração</DocLink>.
        </LegendRow>
        <LegendRow term="drops">
          A classe do <em>derrotado</em> decide qual material cai, nunca a do vencedor. É
          categorização de loot — classe continua sem influenciar o combate.
        </LegendRow>
      </dl>
      <p className="mt-6 font-sans text-xs text-bone/60">
        Nenhum destes números vive em código — todos vêm do banco e chegam ao jogo pelo
        bundle exportado. Ajustar é um <Mono>POST</Mono> ou <Mono>PATCH</Mono> versionado.
      </p>
    </section>
  );
}

function LegendRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 py-4 md:grid-cols-[190px_1fr] md:gap-6">
      <dt className="font-mono text-micro uppercase tracking-widest text-graphite">
        {term}
      </dt>
      <dd className="font-sans text-xs text-bone/85">{children}</dd>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-xs text-bone">{children}</code>;
}

function DocLink({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <Link to={`/documents/${slug}`} className="text-bone underline underline-offset-2">
      {children}
    </Link>
  );
}
