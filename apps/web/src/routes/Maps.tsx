import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useBiomes,
  useCreatures,
  useElements,
  useGlyphs,
  useMapBiomeRegions,
  useMapBiomes,
  useMapConnections,
  useMaps,
  useMiningRates,
  useNpcDuelists,
  useNpcs,
} from "../hooks/useApi";
import { cn } from "../lib/cn";
import { ERA_LABEL, ERA_SCIENTIFIC_LABEL, formatNumber, plural } from "../lib/labels";

/**
 * MAP — os mapas, e o chão de cada um.
 *
 * A tela existe porque o dado espacial do bestiário está espalhado por quatro
 * tabelas que só dizem a verdade juntas: `game_maps` (quais mapas existem),
 * `map_biomes` (quais biomas cada um tem e em que ORDEM a travessia os
 * apresenta), `map_biome_regions` (que CHÃO cada bioma ocupa) e
 * `map_connections` (quem leva a quem, e a que preço). Lidas separadas, as
 * duas do meio parecem a mesma coisa e não são — um bioma pode estar na
 * travessia sem ocupar um metro do terreno, e é justamente esse estado que
 * ninguém percebe olhando uma tabela de cada vez.
 *
 * Por isso o desenho do plano é o centro da página, e por isso ele é
 * *resolvido* em vez de apenas empilhado: as regiões são avaliadas em
 * `sortOrder` com primeira-que-casa-vence, exatamente como o schema declara,
 * e o fundo é o fallback declarado (primeiro bioma do mapa por
 * `map_biomes.sortOrder`). Desenhar as formas na ordem do cadastro, uma sobre
 * a outra, daria uma figura plausível e errada sempre que duas se cruzassem —
 * e no PZ-01 o recife cruza a costa.
 *
 * Continua sendo leitura, como o resto do app fora de `/elements`: nada aqui
 * escreve.
 */

// ---------------------------------------------------------------------------
// Tipos derivados das queries — mesma convenção da ficha de criatura.
// ---------------------------------------------------------------------------

type GameMap = NonNullable<ReturnType<typeof useMaps>["data"]>[number];
type Biome = NonNullable<ReturnType<typeof useBiomes>["data"]>[number];
type MapBiomeLink = NonNullable<ReturnType<typeof useMapBiomes>["data"]>[number];
type Region = NonNullable<ReturnType<typeof useMapBiomeRegions>["data"]>[number];
type Connection = NonNullable<ReturnType<typeof useMapConnections>["data"]>[number];
type Glyph = NonNullable<ReturnType<typeof useGlyphs>["data"]>[number];
type Npc = NonNullable<ReturnType<typeof useNpcs>["data"]>[number];
type Duelist = NonNullable<ReturnType<typeof useNpcDuelists>["data"]>[number];
type Creature = NonNullable<ReturnType<typeof useCreatures>["data"]>[number];

interface BandParams {
  axis: "x" | "z";
  from: number;
  to: number;
}
interface CircleParams {
  cx: number;
  cz: number;
  r: number;
}
interface RectParams {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

// ---------------------------------------------------------------------------
// Resolução espacial — o espelho da regra declarada no schema
// ---------------------------------------------------------------------------

/**
 * Um ponto do plano pertence à PRIMEIRA região que o contém, em `sortOrder`.
 *
 * Isto é cópia deliberada de uma regra que mora em `map_biome_regions` e é
 * executada pelo Godot. A cópia se justifica porque o valor da tela é mostrar
 * o que o jogo vai responder, não o que foi cadastrado: se as duas leituras
 * discordarem, a discordância é o achado. O que NÃO se copia é o tamanho do
 * mapa — as coordenadas são o quadrado unitário [−1, 1], e quem multiplica
 * pelo meio-lado em metros é o Godot (`MapTerrain.SIZE * 0.5`).
 */
function containsPoint(region: Region, x: number, z: number): boolean {
  const p = region.params;
  if (region.shape === "band" && "axis" in p) {
    const b = p as BandParams;
    const [lo, hi] = b.from <= b.to ? [b.from, b.to] : [b.to, b.from];
    const v = b.axis === "x" ? x : z;
    return v >= lo && v <= hi;
  }
  if (region.shape === "circle" && "r" in p) {
    const c = p as CircleParams;
    return (x - c.cx) ** 2 + (z - c.cz) ** 2 <= c.r ** 2;
  }
  if (region.shape === "rect" && "x0" in p) {
    const r = p as RectParams;
    const [xlo, xhi] = r.x0 <= r.x1 ? [r.x0, r.x1] : [r.x1, r.x0];
    const [zlo, zhi] = r.z0 <= r.z1 ? [r.z0, r.z1] : [r.z1, r.z0];
    return x >= xlo && x <= xhi && z >= zlo && z <= zhi;
  }
  return false;
}

/**
 * Fração do plano que cada bioma responde, amostrada na malha.
 *
 * Área analítica sairia mais exata, mas exigiria interseção de círculo com
 * faixa com retângulo — e a pergunta que a tela faz ("esse bioma ocupa um
 * quinto do mapa ou um pixel?") não precisa dessa exatidão. 128² é fino o
 * bastante para que o erro fique abaixo do arredondamento exibido.
 */
function coverageByBiome(
  regions: Region[],
  fallbackBiomeId: number | null,
  samples = 128,
): Map<number, number> {
  const ordered = [...regions].sort((a, b) => a.sortOrder - b.sortOrder);
  const hits = new Map<number, number>();
  const step = 2 / samples;
  for (let i = 0; i < samples; i++) {
    const x = -1 + step * (i + 0.5);
    for (let j = 0; j < samples; j++) {
      const z = -1 + step * (j + 0.5);
      const match = ordered.find((r) => containsPoint(r, x, z));
      const id = match ? match.biomeId : fallbackBiomeId;
      if (id == null) continue;
      hits.set(id, (hits.get(id) ?? 0) + 1);
    }
  }
  const total = samples * samples;
  const out = new Map<number, number>();
  for (const [id, n] of hits) out.set(id, n / total);
  return out;
}

// ---------------------------------------------------------------------------
// Cor do bioma — derivada, nunca cadastrada
// ---------------------------------------------------------------------------

function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function mixHex(a: string, b: string, t: number): string {
  const channel = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) || 0;
  const mixed = [0, 1, 2].map((i) =>
    Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${mixed.join("")}`;
}

const NEUTRAL_BIOME_COLOR = "#3A3F47";

/**
 * O bioma não tem cor no banco — e não deve ganhar uma só para esta tela.
 *
 * `biomes.predominant_elements` é um texto tipo "Agua + Terra", e os
 * elementos já têm paleta canônica (a mesma que `/elements` edita). Misturar
 * os `mid` na ordem em que o bioma os declara dá uma cor que MUDA quando a
 * paleta do elemento muda, que é o comportamento certo: se Água virar
 * esverdeada, o mar do PZ-01 acompanha sem ninguém tocar nesta tela.
 *
 * Peso 62/38 e não 50/50 porque a ordem do texto é ordem de predominância —
 * "Agua + Terra" é um bioma de água com terra, não meio a meio. Acima de dois
 * elementos a média simples serve; não há caso desses no catálogo hoje.
 */
function biomeColor(biome: Biome | undefined, midByElementName: Map<string, string>): string {
  if (!biome?.predominantElements) return NEUTRAL_BIOME_COLOR;
  const mids = biome.predominantElements
    .split(/[+,/]/)
    .map((n) => midByElementName.get(stripAccents(n)))
    .filter((c): c is string => !!c);
  const [first, ...rest] = mids;
  if (!first) return NEUTRAL_BIOME_COLOR;
  if (rest.length === 0) return first;
  if (rest.length === 1) return mixHex(first, rest[0]!, 0.38);
  return rest.reduce((acc, c, i) => mixHex(acc, c, 1 / (i + 2)), first);
}

// ---------------------------------------------------------------------------
// Leitura em prosa da forma
// ---------------------------------------------------------------------------

function coord(v: number): string {
  return formatNumber(v, 2);
}

function shapeSummary(region: Region): string {
  const p = region.params;
  if (region.shape === "band" && "axis" in p) {
    const b = p as BandParams;
    return `faixa em ${b.axis} · ${coord(b.from)} → ${coord(b.to)}`;
  }
  if (region.shape === "circle" && "r" in p) {
    const c = p as CircleParams;
    return `círculo · centro (${coord(c.cx)}; ${coord(c.cz)}) · raio ${coord(c.r)}`;
  }
  if (region.shape === "rect" && "x0" in p) {
    const r = p as RectParams;
    return `retângulo · x ${coord(r.x0)} → ${coord(r.x1)} · z ${coord(r.z0)} → ${coord(r.z1)}`;
  }
  return region.shape;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function Maps() {
  const maps = useMaps();
  const biomes = useBiomes();
  const mapBiomes = useMapBiomes();
  const regions = useMapBiomeRegions();
  const connections = useMapConnections();
  const glyphs = useGlyphs();
  const npcs = useNpcs();
  const duelists = useNpcDuelists();
  const creatures = useCreatures();
  const elements = useElements();
  const rates = useMiningRates();

  const midByElementName = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of elements.data ?? []) {
      if (e.paletteMid) m.set(stripAccents(e.name), e.paletteMid);
    }
    return m;
  }, [elements.data]);

  const biomeById = useMemo(
    () => new Map((biomes.data ?? []).map((b) => [b.id, b])),
    [biomes.data],
  );

  /**
   * Biomas com ao menos uma taxa de mineração própria. O resto é neutro na
   * fórmula — e o export avisa quando um bioma de mapa cai nesse estado.
   */
  const biomesWithRates = useMemo(() => {
    const s = new Set<number>();
    for (const r of rates.data ?? []) if (r.biomeId != null) s.add(r.biomeId);
    return s;
  }, [rates.data]);

  if (maps.isLoading) {
    return <p className="font-mono text-micro text-graphite">carregando…</p>;
  }
  if (maps.error) {
    return <p className="font-mono text-micro text-ember">erro: {String(maps.error)}</p>;
  }

  const orderedMaps = [...(maps.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalRegions = regions.data?.length ?? 0;

  return (
    <div className="space-y-14">
      <header className="space-y-3">
        <p className="font-mono text-micro tracking-widest text-graphite">MAP</p>
        <h1 className="font-display text-2xl text-bone">Mapas</h1>
        <p className="max-w-prose font-sans text-base text-bone/80">
          Três eras, três submapas cada — <strong className="text-bone">nove no total</strong> quando
          o catálogo estiver completo. Cada mapa carrega sua própria travessia de ambientes, e cada
          bioma dessa travessia ocupa (ou deveria ocupar) um pedaço do chão.
        </p>
        <p className="max-w-prose font-mono text-xs text-graphite">
          {orderedMaps.length} {plural(orderedMaps.length, "mapa")} no catálogo ·{" "}
          {biomes.data?.length ?? "—"} biomas · {totalRegions}{" "}
          {plural(totalRegions, "região", "regiões")} no plano. As coordenadas das regiões são o
          quadrado unitário [−1, 1]; quem multiplica pelo meio-lado em metros é o Godot.
        </p>
      </header>

      <ChainOverview
        maps={orderedMaps}
        connections={connections.data ?? []}
        glyphs={glyphs.data ?? []}
      />

      <div className="space-y-16">
        {orderedMaps.map((map) => (
          <MapSection
            key={map.code}
            map={map}
            links={(mapBiomes.data ?? []).filter((l) => l.mapId === map.id)}
            regions={(regions.data ?? []).filter((r) => r.mapId === map.id)}
            biomeById={biomeById}
            midByElementName={midByElementName}
            biomesWithRates={biomesWithRates}
            creatures={(creatures.data ?? []).filter((c) => c.mapId === map.id)}
            npcs={(npcs.data ?? []).filter((n) => n.mapId === map.id)}
            duelists={duelists.data ?? []}
            glyphs={glyphs.data ?? []}
            outgoing={(connections.data ?? []).filter((c) => c.fromMapId === map.id)}
            maps={orderedMaps}
          />
        ))}
      </div>

      <GlyphLedger
        glyphs={glyphs.data ?? []}
        duelists={duelists.data ?? []}
        npcs={npcs.data ?? []}
        connections={connections.data ?? []}
        maps={orderedMaps}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// A corrente de mapas
// ---------------------------------------------------------------------------

/**
 * A progressão inteira em uma linha. `map_connections` é lista de arestas
 * justamente para que um atalho ou uma rota opcional caibam depois sem
 * migration — então o desenho segue as arestas, não a ordem de `sortOrder`.
 */
function ChainOverview({
  maps,
  connections,
  glyphs,
}: {
  maps: GameMap[];
  connections: Connection[];
  glyphs: Glyph[];
}) {
  const glyphById = new Map(glyphs.map((g) => [g.id, g]));
  const mapById = new Map(maps.map((m) => [m.id, m]));

  return (
    <section className="border-t border-graphite/40 pt-6">
      <p className="font-mono text-micro uppercase tracking-widest text-graphite">travessia</p>
      <div className="mt-4 flex flex-wrap items-stretch gap-3">
        {maps.map((map, i) => {
          const out = connections.find((c) => c.fromMapId === map.id);
          const target = out ? mapById.get(out.toMapId) : undefined;
          const glyph = out?.requiredGlyphId ? glyphById.get(out.requiredGlyphId) : null;
          return (
            <div key={map.code} className="flex items-stretch gap-3">
              <a
                href={`#${map.code}`}
                className="block border border-graphite/50 px-4 py-3 transition-colors hover:border-bone/60"
              >
                <p className="font-mono text-micro text-ember">{map.code}</p>
                <p className="mt-1 font-display text-base text-bone">{map.name}</p>
                <p className="mt-1 font-mono text-micro text-graphite">{ERA_LABEL[map.era]}</p>
              </a>
              {out && target ? (
                <div className="flex flex-col justify-center px-1 text-center">
                  <span className="font-mono text-micro text-graphite">→</span>
                  <span
                    className={cn(
                      "mt-1 font-mono text-micro",
                      glyph ? "text-ember" : "text-graphite",
                    )}
                  >
                    {glyph ? glyph.name : "livre"}
                  </span>
                </div>
              ) : (
                i === maps.length - 1 && (
                  <div className="flex flex-col justify-center px-1 text-center">
                    <span className="font-mono text-micro text-graphite">→</span>
                    <span className="mt-1 max-w-[7rem] font-mono text-micro text-graphite/70">
                      sem travessia cadastrada
                    </span>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 max-w-prose font-mono text-micro text-graphite">
        Travessia dentro de uma era é livre e sem guardião; só a que fecha a era cobra um Glifo. As
        nulidades de <span className="text-bone">requiredGlyphId</span> são estado normal, não dado
        faltando.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Um mapa
// ---------------------------------------------------------------------------

interface MapSectionProps {
  map: GameMap;
  links: MapBiomeLink[];
  regions: Region[];
  biomeById: Map<number, Biome>;
  midByElementName: Map<string, string>;
  biomesWithRates: Set<number>;
  creatures: Creature[];
  npcs: Npc[];
  duelists: Duelist[];
  glyphs: Glyph[];
  outgoing: Connection[];
  maps: GameMap[];
}

function MapSection({
  map,
  links,
  regions,
  biomeById,
  midByElementName,
  biomesWithRates,
  creatures,
  npcs,
  duelists,
  glyphs,
  outgoing,
  maps,
}: MapSectionProps) {
  const orderedLinks = [...links].sort((a, b) => a.sortOrder - b.sortOrder);
  const orderedRegions = [...regions].sort((a, b) => a.sortOrder - b.sortOrder);
  const fallbackBiomeId = orderedLinks[0]?.biomeId ?? null;

  // A dependência é `regions`/`fallbackBiomeId` porque `orderedRegions` é uma
  // lista nova a cada render; a identidade estável é a que veio da query.
  const coverage = useMemo(
    () => coverageByBiome(regions, fallbackBiomeId),
    [regions, fallbackBiomeId],
  );

  const placedBiomeIds = new Set(orderedRegions.map((r) => r.biomeId));
  /**
   * Biomas na travessia que não ocupam chão nenhum — existem no catálogo e
   * não existem no terreno.
   */
  const unplaced = orderedLinks.filter((l) => !placedBiomeIds.has(l.biomeId));
  /** O inverso: região apontando para bioma que o mapa não declara ter. */
  const orphanRegions = orderedRegions.filter(
    (r) => !orderedLinks.some((l) => l.biomeId === r.biomeId),
  );

  const mapById = new Map(maps.map((m) => [m.id, m]));
  const glyphById = new Map(glyphs.map((g) => [g.id, g]));
  const fallbackBiome = fallbackBiomeId != null ? biomeById.get(fallbackBiomeId) : undefined;

  return (
    <section id={map.code} className="scroll-mt-6 border-t border-graphite/40 pt-8">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-xs text-ember">{map.code}</span>
        <h2 className="font-display text-xl text-bone">{map.name}</h2>
        <span
          className="font-mono text-micro uppercase tracking-widest text-graphite"
          title={ERA_SCIENTIFIC_LABEL[map.era]}
        >
          {ERA_LABEL[map.era]}
        </span>
        {map.status && <span className="font-mono text-micro text-graphite">· {map.status}</span>}
      </header>

      {map.notes && <p className="mt-3 max-w-prose font-sans text-xs text-bone/70">{map.notes}</p>}

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        <Metric label="criaturas" value={creatures.length} to={`/bestiary?mapCode=${map.code}`} />
        <Metric label="biomas na travessia" value={orderedLinks.length} />
        <Metric
          label={plural(orderedRegions.length, "região no plano", "regiões no plano")}
          value={orderedRegions.length}
          alert={orderedRegions.length === 0}
        />
        <Metric label="npcs" value={npcs.length} />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <MapPlan
          mapCode={map.code}
          regions={orderedRegions}
          fallbackBiome={fallbackBiome}
          biomeById={biomeById}
          midByElementName={midByElementName}
        />

        <div className="space-y-8">
          <BiomeTraversal
            links={orderedLinks}
            biomeById={biomeById}
            midByElementName={midByElementName}
            coverage={coverage}
            placedBiomeIds={placedBiomeIds}
            biomesWithRates={biomesWithRates}
            hasRegions={orderedRegions.length > 0}
          />

          {orderedRegions.length > 0 && (
            <RegionList
              regions={orderedRegions}
              biomeById={biomeById}
              midByElementName={midByElementName}
              fallbackBiome={fallbackBiome}
            />
          )}

          {(unplaced.length > 0 || orphanRegions.length > 0 || orderedRegions.length === 0) && (
            <div className="border-l-2 border-ember/60 pl-4">
              <p className="font-mono text-micro uppercase tracking-widest text-ember">
                partição incompleta
              </p>
              <ul className="mt-2 space-y-1 font-mono text-micro text-bone/70">
                {orderedRegions.length === 0 && (
                  <li>
                    Nenhuma região cadastrada: o mapa inteiro resolve para o fallback declarado
                    {fallbackBiome ? ` — ${fallbackBiome.name}` : ""}. Não é ausência de dado, é a
                    regra funcionando; mas os outros {Math.max(orderedLinks.length - 1, 0)} biomas
                    da travessia não têm onde acontecer.
                  </li>
                )}
                {orderedRegions.length > 0 &&
                  unplaced.map((l) => (
                    <li key={l.id}>
                      <span className="text-bone">
                        {biomeById.get(l.biomeId)?.name ?? `#${l.biomeId}`}
                      </span>{" "}
                      está na travessia e não ocupa chão nenhum.
                    </li>
                  ))}
                {orphanRegions.map((r) => (
                  <li key={r.code}>
                    <span className="text-ember">{r.code}</span> ocupa chão de um bioma que{" "}
                    {map.code} não declara ter — região órfã de <code>map_biomes</code>.
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Inhabitants npcs={npcs} duelists={duelists} glyphs={glyphs} />

          <Exits
            outgoing={outgoing}
            mapById={mapById}
            glyphById={glyphById}
            mapCode={map.code}
          />
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  to,
  alert = false,
}: {
  label: string;
  value: number | string;
  to?: string;
  alert?: boolean;
}) {
  const body = (
    <>
      <p className="font-mono text-micro uppercase tracking-widest text-graphite">{label}</p>
      <p className={cn("mt-1 font-display text-lg", alert ? "text-ember" : "text-bone")}>{value}</p>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="border-l border-graphite/40 pl-4 hover:border-bone/60">
        {body}
      </Link>
    );
  }
  return <div className="border-l border-graphite/40 pl-4">{body}</div>;
}

// ---------------------------------------------------------------------------
// O plano
// ---------------------------------------------------------------------------

const PLAN = 200; // lado do quadrado unitário, em unidades de viewBox

function toSvg(v: number): number {
  return (v + 1) * (PLAN / 2);
}

/**
 * O quadrado unitário do mapa, pintado pela regra de resolução.
 *
 * O truque que mantém o desenho fiel sem amostrar pixel a pixel: pintar o
 * fallback como fundo e depois as regiões da MAIOR `sortOrder` para a menor.
 * A que resolve primeiro é a última a ser pintada, portanto a que fica por
 * cima — que é exatamente "primeira-que-casa-vence" expresso em ordem de
 * desenho. Empilhar na ordem do cadastro daria o resultado invertido em toda
 * interseção, e no PZ-01 o recife cruza a costa.
 */
function MapPlan({
  mapCode,
  regions,
  fallbackBiome,
  biomeById,
  midByElementName,
}: {
  mapCode: string;
  regions: Region[];
  fallbackBiome: Biome | undefined;
  biomeById: Map<number, Biome>;
  midByElementName: Map<string, string>;
}) {
  const painted = [...regions].sort((a, b) => b.sortOrder - a.sortOrder);
  const clipId = `plan-clip-${mapCode}`;

  return (
    <figure className="space-y-3">
      <svg
        viewBox="-20 -20 240 240"
        className="w-full max-w-[340px] bg-void"
        role="img"
        aria-label={`Plano de ${mapCode}: cada cor é o bioma que aquele ponto resolve`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={PLAN} height={PLAN} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <rect
            x="0"
            y="0"
            width={PLAN}
            height={PLAN}
            fill={biomeColor(fallbackBiome, midByElementName)}
          />
          {painted.map((region) => (
            <RegionShape
              key={region.code}
              region={region}
              fill={biomeColor(biomeById.get(region.biomeId), midByElementName)}
              label={`${region.code} · ${biomeById.get(region.biomeId)?.name ?? ""}`}
            />
          ))}
        </g>

        {/* Cruz no centro: sem ela o quadrado não diz onde é o (0, 0), e toda
            leitura de coordenada vira chute. */}
        <g stroke="#E8E4D8" strokeOpacity="0.2" strokeWidth="0.7">
          <line x1="100" y1="0" x2="100" y2={PLAN} strokeDasharray="3 5" />
          <line x1="0" y1="100" x2={PLAN} y2="100" strokeDasharray="3 5" />
        </g>
        <rect x="0" y="0" width={PLAN} height={PLAN} fill="none" stroke="#4A4F58" strokeWidth="1" />
        <g fill="#4A4F58" fontSize="9" fontFamily="ui-monospace, monospace">
          <text x="0" y="-7">
            −1
          </text>
          <text x={PLAN} y="-7" textAnchor="end">
            x +1
          </text>
          <text x="-7" y="3" textAnchor="end">
            −1
          </text>
          <text x="-7" y={PLAN} textAnchor="end">
            z +1
          </text>
        </g>
      </svg>
      <figcaption className="max-w-[340px] font-mono text-micro leading-relaxed text-graphite">
        {regions.length > 0 ? (
          <>
            Resolvido, não empilhado: a região de menor{" "}
            <span className="text-bone">sortOrder</span> vence e aparece por cima. O fundo é o
            fallback declarado{fallbackBiome ? ` — ${fallbackBiome.name}` : ""}.
          </>
        ) : (
          <>
            Sem regiões: todo ponto cai no fallback declarado
            {fallbackBiome ? ` — ${fallbackBiome.name}` : ""}.
          </>
        )}
      </figcaption>
    </figure>
  );
}

function RegionShape({
  region,
  fill,
  label,
}: {
  region: Region;
  fill: string;
  label: string;
}) {
  const p = region.params;
  const common = { fill, stroke: "#0A0B0D", strokeOpacity: 0.35, strokeWidth: 1 };

  if (region.shape === "band" && "axis" in p) {
    const b = p as BandParams;
    const [lo, hi] = b.from <= b.to ? [b.from, b.to] : [b.to, b.from];
    const a = toSvg(lo);
    const len = toSvg(hi) - a;
    return (
      <rect
        {...common}
        x={b.axis === "x" ? a : 0}
        y={b.axis === "z" ? a : 0}
        width={b.axis === "x" ? len : PLAN}
        height={b.axis === "z" ? len : PLAN}
      >
        <title>{label}</title>
      </rect>
    );
  }
  if (region.shape === "circle" && "r" in p) {
    const c = p as CircleParams;
    return (
      <circle {...common} cx={toSvg(c.cx)} cy={toSvg(c.cz)} r={c.r * (PLAN / 2)}>
        <title>{label}</title>
      </circle>
    );
  }
  if (region.shape === "rect" && "x0" in p) {
    const r = p as RectParams;
    const [xlo, xhi] = r.x0 <= r.x1 ? [r.x0, r.x1] : [r.x1, r.x0];
    const [zlo, zhi] = r.z0 <= r.z1 ? [r.z0, r.z1] : [r.z1, r.z0];
    return (
      <rect
        {...common}
        x={toSvg(xlo)}
        y={toSvg(zlo)}
        width={toSvg(xhi) - toSvg(xlo)}
        height={toSvg(zhi) - toSvg(zlo)}
      >
        <title>{label}</title>
      </rect>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// A travessia
// ---------------------------------------------------------------------------

function BiomeTraversal({
  links,
  biomeById,
  midByElementName,
  coverage,
  placedBiomeIds,
  biomesWithRates,
  hasRegions,
}: {
  links: MapBiomeLink[];
  biomeById: Map<number, Biome>;
  midByElementName: Map<string, string>;
  coverage: Map<number, number>;
  placedBiomeIds: Set<number>;
  biomesWithRates: Set<number>;
  hasRegions: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-micro uppercase tracking-widest text-graphite">
        travessia — na ordem em que o mapa a apresenta
      </p>
      <ul className="mt-3 divide-y divide-graphite/25 border-y border-graphite/25">
        {links.map((link, i) => {
          const biome = biomeById.get(link.biomeId);
          const share = coverage.get(link.biomeId) ?? 0;
          const placed = placedBiomeIds.has(link.biomeId);
          return (
            <li key={link.id} className="flex items-start gap-3 py-3">
              <span className="mt-1 font-mono text-micro text-graphite">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className="mt-1 h-3 w-3 shrink-0 border border-bone/20"
                style={{ background: biomeColor(biome, midByElementName) }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-micro text-graphite">{biome?.code}</span>
                  <span className="font-display text-base text-bone">
                    {biome?.name ?? `#${link.biomeId}`}
                  </span>
                  {biome?.predominantElements && (
                    <span className="font-mono text-micro text-bone/60">
                      {biome.predominantElements}
                    </span>
                  )}
                </p>
                {biome?.notes && <p className="mt-1 font-sans text-xs text-bone/60">{biome.notes}</p>}
                <p className="mt-1 font-mono text-micro text-graphite">
                  {hasRegions ? (
                    placed || share > 0 ? (
                      <span className={share === 0 ? "text-ember" : undefined}>
                        {formatNumber(share * 100, share < 0.1 ? 1 : 0)}% do plano
                      </span>
                    ) : (
                      <span className="text-ember">sem chão no plano</span>
                    )
                  ) : (
                    <span>plano não particionado</span>
                  )}
                  {" · "}
                  {biomesWithRates.has(link.biomeId) ? (
                    "mineração com taxas próprias"
                  ) : (
                    <span title="O export avisa quando um bioma de mapa não tem mining_rates: a fórmula trata o lado ausente como neutro.">
                      mineração neutra
                    </span>
                  )}
                </p>
              </div>
            </li>
          );
        })}
        {links.length === 0 && (
          <li className="py-3 font-mono text-micro text-ember">
            nenhum bioma ligado a este mapa.
          </li>
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// As regiões, na ordem em que são avaliadas
// ---------------------------------------------------------------------------

function RegionList({
  regions,
  biomeById,
  midByElementName,
  fallbackBiome,
}: {
  regions: Region[];
  biomeById: Map<number, Biome>;
  midByElementName: Map<string, string>;
  fallbackBiome: Biome | undefined;
}) {
  return (
    <div>
      <p className="font-mono text-micro uppercase tracking-widest text-graphite">
        regiões — na ordem em que são avaliadas
      </p>
      <ol className="mt-3 space-y-3">
        {regions.map((region) => {
          const biome = biomeById.get(region.biomeId);
          return (
            <li key={region.code} className="flex items-start gap-3">
              <span
                className="mt-1 h-3 w-3 shrink-0 border border-bone/20"
                style={{ background: biomeColor(biome, midByElementName) }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-micro text-graphite">{region.code}</span>
                  <span className="font-sans text-xs text-bone">
                    {biome?.name ?? `#${region.biomeId}`}
                  </span>
                  <span className="font-mono text-micro text-bone/60">{shapeSummary(region)}</span>
                </p>
                {region.notes && (
                  <p className="mt-1 max-w-prose font-sans text-xs text-bone/55">{region.notes}</p>
                )}
              </div>
            </li>
          );
        })}
        <li className="flex items-start gap-3 border-t border-graphite/25 pt-3">
          <span
            className="mt-1 h-3 w-3 shrink-0 border border-bone/20"
            style={{ background: biomeColor(fallbackBiome, midByElementName) }}
            aria-hidden
          />
          <p className="font-mono text-micro text-graphite">
            fallback · {fallbackBiome?.name ?? "—"} — o que responde a um ponto que nenhuma região
            contém.
          </p>
        </li>
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quem está lá
// ---------------------------------------------------------------------------

const NPC_ROLE_LABEL: Record<string, string> = {
  merchant: "comerciante",
  duelist: "duelista",
  quest: "missão",
  flavor: "ambientação",
};

function Inhabitants({
  npcs,
  duelists,
  glyphs,
}: {
  npcs: Npc[];
  duelists: Duelist[];
  glyphs: Glyph[];
}) {
  const glyphById = new Map(glyphs.map((g) => [g.id, g]));
  return (
    <div>
      <p className="font-mono text-micro uppercase tracking-widest text-graphite">quem está lá</p>
      {npcs.length === 0 ? (
        <p className="mt-2 font-mono text-micro text-graphite">
          nenhum NPC neste mapa — sem loja e sem arena.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {npcs.map((npc) => {
            const duel = duelists.find((d) => d.npcId === npc.id);
            const glyph = duel?.grantsGlyphId ? glyphById.get(duel.grantsGlyphId) : null;
            return (
              <li key={npc.code} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-micro text-graphite">{npc.code}</span>
                <span className="font-sans text-xs text-bone">{npc.name}</span>
                <span className="font-mono text-micro text-bone/60">
                  {NPC_ROLE_LABEL[npc.role] ?? npc.role}
                </span>
                {npc.faction && (
                  <span className="font-mono text-micro text-graphite">· {npc.faction}</span>
                )}
                {duel && (
                  <span className="font-mono text-micro text-graphite">
                    · oponente nv. {duel.opponentLevel}
                    {glyph ? (
                      <>
                        {" · concede "}
                        <span className="text-ember">{glyph.name}</span>
                      </>
                    ) : (
                      " · não concede Glifo"
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saídas
// ---------------------------------------------------------------------------

function Exits({
  outgoing,
  mapById,
  glyphById,
  mapCode,
}: {
  outgoing: Connection[];
  mapById: Map<number, GameMap>;
  glyphById: Map<number, Glyph>;
  mapCode: string;
}) {
  return (
    <div>
      <p className="font-mono text-micro uppercase tracking-widest text-graphite">saídas</p>
      {outgoing.length === 0 ? (
        <p className="mt-2 font-mono text-micro text-graphite">
          {mapCode} não leva a lugar nenhum ainda — a era seguinte não está no catálogo.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {[...outgoing]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((c) => {
              const target = mapById.get(c.toMapId);
              const glyph = c.requiredGlyphId ? glyphById.get(c.requiredGlyphId) : null;
              return (
                <li key={c.id} className="font-mono text-micro text-bone/70">
                  → <span className="text-bone">{target?.code ?? `#${c.toMapId}`}</span>{" "}
                  {target?.name}
                  {" · "}
                  {glyph ? (
                    <span className="text-ember">exige o Glifo {glyph.name}</span>
                  ) : (
                    "passagem livre, sem guardião"
                  )}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glifos
// ---------------------------------------------------------------------------

/**
 * O balanço dos Glifos: quem concede, quem cobra.
 *
 * Está aqui e não em tela própria porque um Glifo só tem sentido entre dois
 * mapas — é a moeda de uma travessia. E o balanço é o ponto: Glifo concedido
 * que travessia nenhuma exige, ou exigido sem que arena alguma o conceda, são
 * estados que travam a campanha em silêncio — o segundo aborta o export
 * justamente por isso.
 */
function GlyphLedger({
  glyphs,
  duelists,
  npcs,
  connections,
  maps,
}: {
  glyphs: Glyph[];
  duelists: Duelist[];
  npcs: Npc[];
  connections: Connection[];
  maps: GameMap[];
}) {
  if (glyphs.length === 0) return null;
  const npcById = new Map(npcs.map((n) => [n.id, n]));
  const mapById = new Map(maps.map((m) => [m.id, m]));

  return (
    <section className="border-t border-graphite/40 pt-8">
      <p className="font-mono text-micro tracking-widest text-graphite">GLF</p>
      <h2 className="mt-2 font-display text-xl text-bone">Glifos</h2>
      <p className="mt-3 max-w-prose font-sans text-xs text-bone/70">
        A chave de uma era para a seguinte: concedido pela arena que fecha a era, cobrado pelo
        guardião da travessia. A tabela abaixo é o balanço entre as duas pontas.
      </p>
      <ul className="mt-5 divide-y divide-graphite/25 border-y border-graphite/25">
        {glyphs.map((glyph) => {
          const granter = duelists.find((d) => d.grantsGlyphId === glyph.id);
          const granterNpc = granter ? npcById.get(granter.npcId) : undefined;
          const granterMap = granterNpc?.mapId != null ? mapById.get(granterNpc.mapId) : undefined;
          const demanded = connections.filter((c) => c.requiredGlyphId === glyph.id);
          return (
            <li key={glyph.code} className="py-4">
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-micro text-ember">{glyph.code}</span>
                <span className="font-display text-lg text-bone">{glyph.name}</span>
              </p>
              <dl className="mt-2 grid gap-x-6 gap-y-1 font-mono text-micro sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-graphite">concedido por</dt>
                  <dd className={granter ? "text-bone/80" : "text-ember"}>
                    {granter
                      ? `${granterNpc?.name ?? granterNpc?.code ?? "arena"}${
                          granterMap ? ` · ${granterMap.code}` : ""
                        }`
                      : "nenhuma arena"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-graphite">exigido em</dt>
                  <dd className={demanded.length > 0 ? "text-bone/80" : "text-ember"}>
                    {demanded.length > 0
                      ? demanded
                          .map(
                            (c) =>
                              `${mapById.get(c.fromMapId)?.code ?? "?"} → ${
                                mapById.get(c.toMapId)?.code ?? "?"
                              }`,
                          )
                          .join(", ")
                      : "nenhuma travessia"}
                  </dd>
                </div>
              </dl>
              {glyph.notes && (
                <p className="mt-2 max-w-prose font-sans text-xs text-bone/55">{glyph.notes}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
