import { Link } from "react-router-dom";
import {
  useChangelog,
  useCreatureClasses,
  useCreatures,
  useElements,
  useItems,
} from "../hooks/useApi";

/**
 * Landing screen. Quiet on purpose — the ficha de criatura is where the
 * ousadia lives, per the visual plan.
 */
export function Home() {
  const elements = useElements();
  const classes = useCreatureClasses();
  const creatures = useCreatures();
  const items = useItems();
  const changelog = useChangelog(1);

  return (
    <div className="space-y-16">
      <section>
        <p className="font-mono text-micro tracking-widest text-graphite">CATÁLOGO</p>
        <h1 className="mt-2 font-display text-2xl text-bone">Bestiário</h1>
        <p className="mt-3 max-w-xl font-sans text-base text-bone/80">
          Consulta ao registro do jogo — criaturas, mapas, lore e histórico de decisões.
          Somente leitura. Alterações passam pela API.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-5">
        <Metric label="criaturas" value={creatures.data?.length ?? "—"} />
        <Metric label="classes" value={classes.data?.length ?? "—"} />
        <Metric label="elementos" value={elements.data?.length ?? "—"} />
        <Metric label="itens" value={items.data?.length ?? "—"} />
        <Metric
          label="última alteração"
          value={changelog.data?.[0]?.version ?? "—"}
          accent
        />
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card
          to="/bestiary"
          code="CRT"
          title="Bestiário"
          desc="Filtre criaturas por era, classe e elemento."
        />
        <Card
          to="/items"
          code="ITM"
          title="Itens"
          desc="Minério, resina e emplastro — com preço, efeito e peso de mineração."
        />
        <Card
          to="/documents"
          code="DOC"
          title="Documentos"
          desc="Capítulos da Design Bible com status de definição."
        />
        <Card
          to="/changelog"
          code="LOG"
          title="Histórico"
          desc="Linha do tempo de cada alteração feita pela API."
        />
      </section>
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="border-l border-graphite/40 pl-4">
      <p className="font-mono text-micro uppercase tracking-widest text-graphite">{label}</p>
      <p
        className={
          "mt-2 font-display text-xl " + (accent ? "text-ember" : "text-bone")
        }
      >
        {value}
      </p>
    </div>
  );
}

function Card({ to, code, title, desc }: { to: string; code: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="group block border border-graphite/40 bg-slate/50 p-6 transition-colors hover:border-bone/60"
    >
      <p className="font-mono text-micro tracking-widest text-graphite group-hover:text-ember">
        {code}
      </p>
      <p className="mt-3 font-display text-lg text-bone">{title}</p>
      <p className="mt-2 font-sans text-xs text-bone/70">{desc}</p>
    </Link>
  );
}
