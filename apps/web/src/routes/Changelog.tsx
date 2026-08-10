import { useChangelog } from "../hooks/useApi";

export function Changelog() {
  const q = useChangelog(500);

  return (
    <div className="space-y-10">
      <header>
        <p className="font-mono text-micro tracking-widest text-graphite">LOG</p>
        <h1 className="mt-2 font-display text-2xl text-bone">Histórico</h1>
        <p className="mt-3 font-mono text-xs text-graphite">
          cada alteração feita pela API — mais recente primeiro
        </p>
      </header>

      {q.isLoading && <p className="font-mono text-xs text-graphite">carregando…</p>}

      <ol className="relative border-l border-graphite/40 pl-8">
        {q.data?.map((entry) => (
          <li key={entry.id} className="relative pb-10">
            <span className="absolute -left-[35px] top-1 h-2 w-2 -translate-x-1/2 rounded-full bg-graphite" />
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-lg text-ember">{entry.version}</span>
              <span className="font-mono text-micro tracking-widest text-graphite">
                {formatDate(entry.date)}
              </span>
              {entry.entity && (
                <span className="font-mono text-micro tracking-widest text-moss">
                  {entry.entity}
                  {entry.entityId != null ? `#${entry.entityId}` : ""}
                </span>
              )}
            </div>
            <p className="mt-2 font-display text-lg text-bone">{entry.change}</p>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
              <p>
                <span className="font-mono text-micro uppercase tracking-widest text-graphite">
                  motivo
                </span>
                <br />
                <span className="font-sans text-bone/85">{entry.reason}</span>
              </p>
              <p>
                <span className="font-mono text-micro uppercase tracking-widest text-graphite">
                  impacto
                </span>
                <br />
                <span className="font-sans text-bone/85">{entry.impact}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatDate(d: string): string {
  // Postgres date column comes as "YYYY-MM-DD" or ISO — take the first 10.
  return d.slice(0, 10);
}
