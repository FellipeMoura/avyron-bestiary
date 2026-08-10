import { Link, useParams } from "react-router-dom";
import { CreatureViewer } from "../components/CreatureViewer";
import {
  useAwakeningByCreature,
  useCreature,
  useCreatureClasses,
  useElements,
  useMaps,
} from "../hooks/useApi";
import { cn } from "../lib/cn";
import { AWAKENING_TYPE_LABEL, ERA_LABEL } from "../lib/labels";

/**
 * The ficha de criatura — where the visual plan spends its budget.
 *
 * Signature elements:
 *   - hero number (CRT-001) as the anchor, mono XL
 *   - vertical `moss` fossil scale to the left, evoking a reference bar
 *     next to a specimen
 *   - side-by-side comparator: base form vs Awakening, with a single ember
 *     accent on the awakening type chip
 */
export function CreatureDetail() {
  const { code } = useParams<{ code: string }>();
  const creature = useCreature(code);
  const awakening = useAwakeningByCreature(code);
  const classes = useCreatureClasses();
  const elements = useElements();
  const maps = useMaps();

  if (creature.isLoading)
    return <p className="font-mono text-xs text-graphite">carregando…</p>;
  if (creature.error)
    return <p className="font-mono text-xs text-ember">{String(creature.error)}</p>;
  if (!creature.data) return null;
  const c = creature.data;

  const cls = classes.data?.find((x) => x.id === c.classId);
  const ele = elements.data?.find((x) => x.id === c.elementId);
  const map = maps.data?.find((x) => x.id === c.mapId);

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
      </section>

      {/* comparator */}
      <section className="mt-14 grid grid-cols-1 gap-px border-y border-graphite/40 bg-graphite/30 md:grid-cols-2">
        <FormPanel
          eyebrow="forma base"
          title={c.originalName}
          rows={[
            ["classe", cls ? `${cls.code} · ${cls.name}` : "—"],
            ["elemento", ele ? `${ele.code} · ${ele.name}` : "—"],
            ["era", map?.era ? ERA_LABEL[map.era] : "—"],
            ["mapa", map ? `${map.code} · ${map.name}` : "—"],
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
    </div>
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
