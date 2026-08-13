import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Filter } from "../components/Filter";
import {
  useCreatureClasses,
  useCreatures,
  useElements,
  useMaps,
  useSyncModels,
} from "../hooks/useApi";
import { cn } from "../lib/cn";
import { ERA_LABEL, plural } from "../lib/labels";

const ERAS = [
  { value: "", label: "todas as eras" },
  { value: "paleozoic", label: ERA_LABEL.paleozoic },
  { value: "mesozoic", label: ERA_LABEL.mesozoic },
  { value: "cenozoic", label: ERA_LABEL.cenozoic },
] as const;

export function Bestiary() {
  const [params, setParams] = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const syncModels = useSyncModels();
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

  const copyJson = async () => {
    if (!creatures.data) return;
    await navigator.clipboard.writeText(JSON.stringify(creatures.data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const runSyncModels = async () => {
    try {
      const result = await syncModels.mutateAsync();
      const parts: string[] = [];
      if (result.attached.length) {
        parts.push(`+${result.attached.map((c) => c.code).join(", ")}`);
      }
      if (result.detached.length) {
        parts.push(`−${result.detached.map((c) => c.code).join(", ")}`);
      }
      setSyncMessage(parts.length ? parts.join(" · ") : "nenhuma mudança");
    } catch {
      setSyncMessage("erro ao sincronizar");
    }
    setTimeout(() => setSyncMessage(null), 6000);
  };

  const classByCode = new Map(classes.data?.map((c) => [c.id, c.code]) ?? []);
  const elemByCode = new Map(elements.data?.map((e) => [e.id, e.code]) ?? []);
  const mapByCode = new Map(maps.data?.map((m) => [m.id, m.code]) ?? []);

  const count = creatures.data?.length;
  const withModel = creatures.data?.filter((c) => c.modelUrl).length;

  return (
    <div className="space-y-10">
      <header>
        <p className="font-mono text-micro tracking-widest text-graphite">CRT</p>
        <h1 className="mt-2 font-display text-2xl text-bone">Bestiário</h1>
        <p className="mt-3 font-mono text-xs text-graphite">
          {count ?? "…"} {count !== undefined ? plural(count, "resultado") : "carregando"}
          {count !== undefined && withModel !== undefined && (
            <>
              {" · "}
              <span className={withModel === count ? "text-moss" : "text-bone"}>
                {withModel} com modelo 3D
              </span>
            </>
          )}
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
        <div className="ml-auto flex items-center gap-3">
          {syncMessage && (
            <span className="max-w-xs truncate font-mono text-micro text-graphite" title={syncMessage}>
              {syncMessage}
            </span>
          )}
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={runSyncModels}
              disabled={syncModels.isPending}
              title="Varre apps/web/public/models e atualiza modelUrl de cada criatura (dev only)"
              className={cn(
                "border border-graphite/60 px-2 py-1.5 font-mono text-micro uppercase tracking-widest",
                "text-graphite transition-colors hover:border-bone hover:text-bone",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-graphite/60 disabled:hover:text-graphite",
              )}
            >
              {syncModels.isPending ? "sincronizando…" : "sincronizar modelos"}
            </button>
          )}
          <button
            type="button"
            onClick={copyJson}
            disabled={!creatures.data}
            className={cn(
              "border border-graphite/60 px-2 py-1.5 font-mono text-micro uppercase tracking-widest",
              "text-graphite transition-colors hover:border-bone hover:text-bone",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-graphite/60 disabled:hover:text-graphite",
            )}
          >
            {copied ? "copiado" : "copiar json"}
          </button>
        </div>
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
        {creatures.data?.map((c) => {
          const rowClassCode = classByCode.get(c.classId);
          const rowElementCode = elemByCode.get(c.elementId);
          return (
            <li key={c.code}>
              <Link
                to={`/bestiary/${c.code}`}
                className="grid grid-cols-[110px_1fr] items-baseline gap-6 py-4 transition-colors hover:bg-slate/50 md:grid-cols-[110px_1.2fr_1fr_1fr_1fr]"
              >
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ember">
                  {c.code}
                  {c.modelUrl && (
                    <span
                      className="text-[10px] text-moss"
                      title="Modelo 3D disponível"
                      aria-label="Modelo 3D disponível"
                    >
                      [3D]
                    </span>
                  )}
                </span>
                <span className="font-display text-lg text-bone">{c.originalName}</span>
                <span className="hidden items-center gap-1.5 font-mono text-xs text-bone/70 md:inline-flex">
                  {rowClassCode && (
                    <img src={`/${rowClassCode}.webp`} alt="" className="h-5 w-5 shrink-0" />
                  )}
                  {rowClassCode ?? "—"}
                </span>
                <span className="hidden items-center gap-1.5 font-mono text-xs text-bone/70 md:inline-flex">
                  {rowElementCode && (
                    <img src={`/${rowElementCode}.webp`} alt="" className="h-5 w-5 shrink-0" />
                  )}
                  {rowElementCode ?? "—"}
                </span>
                <span className="hidden font-mono text-xs text-bone/70 md:inline">
                  {c.mapId != null ? mapByCode.get(c.mapId) ?? "—" : "—"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
