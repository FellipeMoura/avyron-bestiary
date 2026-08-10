import { Link, useParams } from "react-router-dom";
import { marked } from "marked";
import { useDocument, useDocuments } from "../hooks/useApi";
import { cn } from "../lib/cn";
import { DOCUMENT_STATUS_LABEL, plural } from "../lib/labels";

const STATUS_COLOR: Record<string, string> = {
  defined: "text-moss",
  partial: "text-bone",
  pending: "text-graphite",
};

export function DocumentsList() {
  const docs = useDocuments();
  const count = docs.data?.length;

  return (
    <div className="space-y-10">
      <header>
        <p className="font-mono text-micro tracking-widest text-graphite">DOC</p>
        <h1 className="mt-2 font-display text-2xl text-bone">Documentos</h1>
        <p className="mt-3 font-mono text-xs text-graphite">
          {count ?? "…"} {count !== undefined ? plural(count, "capítulo") : "carregando"}
        </p>
      </header>

      {docs.isLoading && <p className="font-mono text-xs text-graphite">carregando…</p>}
      <ul className="divide-y divide-graphite/30 border-y border-graphite/30">
        {docs.data?.map((d) => (
          <li key={d.slug}>
            <Link
              to={`/documents/${d.slug}`}
              className="grid grid-cols-[80px_1fr_100px] items-baseline gap-4 py-4 transition-colors hover:bg-slate/50"
            >
              <span className="font-mono text-micro text-graphite">
                {String(d.sortOrder).padStart(2, "0")}
              </span>
              <span className="font-display text-lg text-bone">{d.title}</span>
              <span
                className={cn(
                  "font-mono text-micro uppercase tracking-widest",
                  STATUS_COLOR[d.status] ?? "text-graphite",
                )}
              >
                {DOCUMENT_STATUS_LABEL[d.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function DocumentDetail() {
  const { slug } = useParams<{ slug: string }>();
  const doc = useDocument(slug);

  if (doc.isLoading) return <p className="font-mono text-xs text-graphite">carregando…</p>;
  if (doc.error) return <p className="font-mono text-xs text-ember">{String(doc.error)}</p>;
  if (!doc.data) return null;

  const html = marked.parse(doc.data.bodyMarkdown, { async: false }) as string;

  return (
    <article>
      <Link
        to="/documents"
        className="mb-8 inline-block font-mono text-micro tracking-widest text-graphite hover:text-bone"
      >
        ← DOCUMENTOS
      </Link>
      <header className="border-b border-graphite/40 pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-mono text-micro tracking-widest text-graphite">
            {String(doc.data.sortOrder).padStart(2, "0")} / {doc.data.slug}
          </p>
          <span
            className={cn(
              "font-mono text-micro uppercase tracking-widest",
              STATUS_COLOR[doc.data.status] ?? "text-graphite",
            )}
          >
            {DOCUMENT_STATUS_LABEL[doc.data.status]}
          </span>
        </div>
        <h1 className="mt-3 font-display text-2xl text-bone">{doc.data.title}</h1>
      </header>

      <div
        className="prose-doc mt-10 max-w-none font-sans text-base text-bone/90"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
