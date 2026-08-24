import { useEffect, useMemo, useState } from "react";
import { useCreatures, useSetCreatureModel } from "../hooks/useApi";
import {
  usePlaceholderModels,
  type PlaceholderModel,
} from "../hooks/usePlaceholderModels";
import { cn } from "../lib/cn";
import { ModelStage } from "./CreatureViewer";

/**
 * "vincular / alterar" — aponta o modelUrl da criatura para um placeholder
 * compartilhado. Ação pontual de escrita permitida pelo CLAUDE.md (regra 1):
 * o PATCH, o changelog e a versão vivem na API; aqui só existe o disparo.
 *
 * Os placeholders são N:1 — o painel mostra, abaixo do 3D de cada opção,
 * quais criaturas já estão vinculadas àquele modelo, para o vínculo novo ser
 * decidido vendo o elenco inteiro que compartilha o mesmo corpo.
 *
 * Dev-only, como o botão de sincronização: fora do build de dev o botão não
 * renderiza e a ficha permanece somente leitura.
 */

const GROUP_LABEL: Record<string, string> = {
  big: "terrestres",
  flying: "voadores",
  quadruped: "quadrúpedes",
};

interface ModelLinkDialogProps {
  creatureCode: string;
  currentUrl: string | null | undefined;
}

export function ModelLinkDialog({ creatureCode, currentUrl }: ModelLinkDialogProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="mt-3 flex items-center justify-end gap-3">
      {message && (
        <span className="max-w-xs truncate font-mono text-micro text-graphite" title={message}>
          {message}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Aponta o modelUrl desta criatura para um placeholder compartilhado (dev only)"
        className={cn(
          "border border-graphite/60 px-2 py-1.5 font-mono text-micro uppercase tracking-widest",
          "text-graphite transition-colors hover:border-bone hover:text-bone",
        )}
      >
        {currentUrl ? "alterar modelo" : "vincular modelo"}
      </button>
      {open && (
        <PickerOverlay
          creatureCode={creatureCode}
          currentUrl={currentUrl}
          onClose={() => setOpen(false)}
          onLinked={(version) => {
            setOpen(false);
            setMessage(`modelo vinculado · v${version}`);
            setTimeout(() => setMessage(null), 6000);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PickerOverlay({
  creatureCode,
  currentUrl,
  onClose,
  onLinked,
}: {
  creatureCode: string;
  currentUrl: string | null | undefined;
  onClose: () => void;
  onLinked: (version: string) => void;
}) {
  const models = usePlaceholderModels();
  const creatures = useCreatures();
  const setModel = useSetCreatureModel();
  const [selectedUrl, setSelectedUrl] = useState<string | null>(currentUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // url do placeholder → criaturas que já apontam para ele
  const linkedByUrl = useMemo(() => {
    const map = new Map<string, { code: string; originalName: string }[]>();
    for (const c of creatures.data ?? []) {
      if (!c.modelUrl) continue;
      const list = map.get(c.modelUrl) ?? [];
      list.push({ code: c.code, originalName: c.originalName });
      map.set(c.modelUrl, list);
    }
    return map;
  }, [creatures.data]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, PlaceholderModel[]>();
    for (const m of models.data ?? []) {
      const list = byGroup.get(m.group) ?? [];
      list.push(m);
      byGroup.set(m.group, list);
    }
    return [...byGroup.entries()];
  }, [models.data]);

  const selected = (models.data ?? []).find((m) => m.url === selectedUrl) ?? null;
  const linked = selected ? (linkedByUrl.get(selected.url) ?? []) : [];
  const isCurrent = selected !== null && selected.url === currentUrl;

  const confirm = async () => {
    if (!selected) return;
    setError(null);
    try {
      const result = await setModel.mutateAsync({
        code: creatureCode,
        modelUrl: selected.url,
        reason: `Placeholder 3D '${selected.name}' vinculado à criatura pela ficha do bestiário`,
        impact: `A ficha ${creatureCode} e o bundle do jogo passam a usar ${selected.url}`,
      });
      onLinked(result.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/90 p-4 md:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="vincular modelo 3D"
        className="grid h-[85vh] w-full max-w-5xl grid-rows-[auto_1fr] border border-graphite/40 bg-void"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between border-b border-graphite/40 px-5 py-3">
          <p className="font-mono text-micro uppercase tracking-widest text-graphite">
            vincular modelo 3D · {creatureCode}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-micro uppercase tracking-widest text-graphite transition-colors hover:text-bone"
          >
            fechar ✕
          </button>
        </header>

        <div className="grid min-h-0 grid-cols-[220px_1fr]">
          {/* lista de opções */}
          <nav className="min-h-0 overflow-y-auto border-r border-graphite/40 py-2">
            {models.isLoading && (
              <p className="px-4 py-2 font-mono text-micro text-graphite">carregando…</p>
            )}
            {models.error != null && (
              <p className="px-4 py-2 font-sans text-xs text-bone/60">
                manifest não encontrado — rode <code>pnpm models:placeholders</code>
              </p>
            )}
            {groups.map(([group, list]) => (
              <div key={group} className="mb-2">
                <p className="px-4 py-2 font-mono text-micro uppercase tracking-widest text-graphite/70">
                  {GROUP_LABEL[group] ?? group}
                </p>
                {list.map((m) => {
                  const count = linkedByUrl.get(m.url)?.length ?? 0;
                  return (
                    <button
                      key={m.url}
                      type="button"
                      onClick={() => setSelectedUrl(m.url)}
                      className={cn(
                        "flex w-full items-baseline justify-between gap-2 px-4 py-1.5 text-left font-mono text-xs transition-colors",
                        m.url === selectedUrl
                          ? "bg-slate/40 text-bone"
                          : "text-bone/60 hover:bg-slate/20 hover:text-bone",
                      )}
                    >
                      <span className="truncate">
                        {m.name}
                        {m.url === currentUrl && (
                          <span className="ml-2 text-moss">· atual</span>
                        )}
                      </span>
                      {count > 0 && <span className="shrink-0 text-graphite">×{count}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* visualização + vínculos existentes */}
          <div className="grid min-h-0 grid-rows-[1fr_auto]">
            {selected ? (
              <div className="relative min-h-0">
                <ModelStage url={selected.url} />
                <p className="pointer-events-none absolute left-3 top-3 font-mono text-micro uppercase tracking-widest text-graphite/70">
                  {selected.name} · {selected.clips.length} animações
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <p className="font-sans text-xs text-bone/50">
                  selecione um modelo na lista para visualizar
                </p>
              </div>
            )}

            <div className="border-t border-graphite/40 px-5 py-4">
              <p className="font-mono text-micro uppercase tracking-widest text-graphite">
                criaturas vinculadas a este modelo
              </p>
              {selected && linked.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                  {linked.map((c) => (
                    <li key={c.code} className="font-mono text-xs text-bone">
                      {c.code}
                      <span className="ml-2 font-sans text-bone/60">{c.originalName}</span>
                      {c.code === creatureCode && (
                        <span className="ml-2 text-moss">· esta ficha</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 font-sans text-xs text-bone/50">
                  {selected ? "nenhuma criatura usa este modelo ainda" : "—"}
                </p>
              )}

              <div className="mt-4 flex items-center justify-end gap-3">
                {error && (
                  <span
                    className="max-w-md truncate font-mono text-micro text-ember"
                    title={error}
                  >
                    {error}
                  </span>
                )}
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!selected || isCurrent || setModel.isPending}
                  className={cn(
                    "border border-bone/60 px-3 py-1.5 font-mono text-micro uppercase tracking-widest",
                    "text-bone transition-colors hover:border-bone hover:bg-slate/30",
                    "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                  )}
                >
                  {setModel.isPending
                    ? "vinculando…"
                    : isCurrent
                      ? "modelo atual"
                      : `vincular a ${creatureCode}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
