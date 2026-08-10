import { Link, useSearchParams } from "react-router-dom";
import { Filter } from "../components/Filter";
import { useCreatureClasses, useCreatures, useElements, useMaps } from "../hooks/useApi";
import { ERA_LABEL, plural } from "../lib/labels";

const ERAS = [
  { value: "", label: "todas as eras" },
  { value: "paleozoic", label: ERA_LABEL.paleozoic },
  { value: "mesozoic", label: ERA_LABEL.mesozoic },
  { value: "cenozoic", label: ERA_LABEL.cenozoic },
] as const;

export function Bestiary() {
  const [params, setParams] = useSearchParams();
  const era = params.get("era") ?? "";
  const classCode = params.get("classCode") ?? "";
  const elementCode = params.get("elementCode") ?? "";

  const classes = useCreatureClasses();
  const elements = useElements();
  const maps = useMaps();
  const creatures = useCreatures({
    era: (era || undefined) as "paleozoic" | "mesozoic" | "cenozoic" | undefined,
    classCode: classCode || undefined,
    elementCode: elementCode || undefined,
  });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const classByCode = new Map(classes.data?.map((c) => [c.id, c.code]) ?? []);
  const elemByCode = new Map(elements.data?.map((e) => [e.id, e.code]) ?? []);
  const mapByCode = new Map(maps.data?.map((m) => [m.id, m.code]) ?? []);

  const count = creatures.data?.length;

  return (
    <div className="space-y-10">
      <header>
        <p className="font-mono text-micro tracking-widest text-graphite">CRT</p>
        <h1 className="mt-2 font-display text-2xl text-bone">Bestiário</h1>
        <p className="mt-3 font-mono text-xs text-graphite">
          {count ?? "…"} {count !== undefined ? plural(count, "resultado") : "carregando"}
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-4 border-y border-graphite/40 py-4">
        <Filter
          label="era"
          value={era}
          onChange={(v) => setFilter("era", v)}
          options={[...ERAS]}
        />
        <Filter
          label="classe"
          value={classCode}
          onChange={(v) => setFilter("classCode", v)}
          options={[
            { value: "", label: "todas as classes" },
            ...(classes.data ?? []).map((c) => ({
              value: c.code,
              label: `${c.code} · ${c.name}`,
            })),
          ]}
        />
        <Filter
          label="elemento"
          value={elementCode}
          onChange={(v) => setFilter("elementCode", v)}
          options={[
            { value: "", label: "todos os elementos" },
            ...(elements.data ?? []).map((e) => ({
              value: e.code,
              label: `${e.code} · ${e.name}`,
            })),
          ]}
        />
      </section>

      {creatures.isLoading && <p className="font-mono text-xs text-graphite">carregando…</p>}
      {creatures.error && (
        <p className="font-mono text-xs text-ember">erro: {String(creatures.error)}</p>
      )}
      {creatures.data && creatures.data.length === 0 && (
        <p className="font-mono text-xs text-graphite">
          nenhuma criatura corresponde a este filtro.
        </p>
      )}

      <ul className="divide-y divide-graphite/30 border-y border-graphite/30">
        {creatures.data?.map((c) => (
          <li key={c.code}>
            <Link
              to={`/bestiary/${c.code}`}
              className="grid grid-cols-[110px_1fr] items-baseline gap-6 py-4 transition-colors hover:bg-slate/50 md:grid-cols-[110px_1.2fr_1fr_1fr_1fr]"
            >
              <span className="font-mono text-xs text-ember">{c.code}</span>
              <span className="font-display text-lg text-bone">{c.originalName}</span>
              <span className="hidden font-mono text-xs text-bone/70 md:inline">
                {classByCode.get(c.classId) ?? "—"}
              </span>
              <span className="hidden font-mono text-xs text-bone/70 md:inline">
                {elemByCode.get(c.elementId) ?? "—"}
              </span>
              <span className="hidden font-mono text-xs text-bone/70 md:inline">
                {c.mapId != null ? mapByCode.get(c.mapId) ?? "—" : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
