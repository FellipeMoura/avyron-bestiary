import { useState } from "react";
import { useElements, useUpdateElementPalette } from "../hooks/useApi";
import { cn } from "../lib/cn";

/**
 * ELE — a paleta canônica dos elementos.
 *
 * A primeira tela de ESCRITA do bestiário, e ela existe por um motivo que
 * `Invoke-RestMethod` não resolve: escolher seis rampas de cor é trabalho de
 * olho. Um `PATCH` com `#2E7FA8` no corpo não diz se o azul de Água some no
 * fundo do PZ-01 — a tira de contexto abaixo de cada rampa diz.
 *
 * Não abre exceção ao `DATA_WORKFLOW.md`: a via de escrita continua sendo a
 * API, `reason`/`impact` continuam obrigatórios, e o changelog registra e
 * versiona igual. O que muda é quem monta o corpo da requisição.
 *
 * ## O que a rampa significa
 *
 * As três paradas NÃO são três cores independentes: são posições numa rampa
 * que o jogo lê por LUMINÂNCIA do atlas do corpo. O texel mais escuro do
 * placeholder cai em `shadow`, o mais claro em `highlight`, e o miolo em
 * `mid`. É por isso que "amarelo com preto" cabe num elemento só — a rampa
 * de Eletricidade sai de quase-preto e chega em amarelo, e a forma do bicho
 * distribui as duas pontas sozinha.
 *
 * A `aura` é coluna própria, e não o `highlight` reaproveitado, porque a
 * escolha óbvia é a errada: com o corpo já recolorido pelo elemento, uma aura
 * na mesma cor some justamente na criatura em que ela deveria gritar.
 */

/**
 * Fundos contra os quais a rampa precisa sobreviver. São os valores reais do
 * PZ-01 no jogo (`MapDressing`): a cor do fundo d'água, a da névoa e a da
 * areia seca da costa. Uma criatura de Água azul num mapa azul com névoa azul
 * é o modo de falha mais provável desta feature, e ele não aparece num swatch
 * sobre branco.
 */
const SCENE_BACKDROPS = [
  { label: "fundo d'água", hex: "#0E3D4A" },
  { label: "névoa", hex: "#1A5D6C" },
  { label: "costa seca", hex: "#B3A379" },
] as const;

interface ElementRow {
  code: string;
  name: string;
  paletteShadow: string | null;
  paletteMid: string | null;
  paletteHighlight: string | null;
  paletteAura: string | null;
  paletteSpread: number;
}

const FALLBACK = {
  shadow: "#20242B",
  mid: "#6B7280",
  highlight: "#F2EDE0",
  aura: "#F2EDE0",
};

export function Elements() {
  const elements = useElements();

  if (elements.isLoading) {
    return <p className="font-mono text-micro text-graphite">carregando…</p>;
  }
  if (elements.error) {
    return <p className="font-mono text-micro text-ember">{String(elements.error)}</p>;
  }

  const rows = (elements.data ?? []) as ElementRow[];

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-display text-xl">Paleta dos elementos</h1>
        <p className="max-w-prose text-xs text-graphite">
          Cada elemento é uma <strong className="text-bone">rampa lida por luminância</strong>, não
          três cores soltas: o jogo mapeia o texel mais escuro do corpo em <em>sombra</em> e o mais
          claro em <em>brilho</em>. A <em>aura</em> é o Despertar Ancestral e tem cor própria de
          propósito — na cor do corpo ela desapareceria. A <em>dispersão</em> é o quanto cada
          criatura pode variar dentro da família sem sair dela.
        </p>
      </header>

      <div className="space-y-12">
        {rows.map((row) => (
          <ElementEditor key={row.code} row={row} />
        ))}
      </div>
    </div>
  );
}

function ElementEditor({ row }: { row: ElementRow }) {
  const [shadow, setShadow] = useState(row.paletteShadow ?? FALLBACK.shadow);
  const [mid, setMid] = useState(row.paletteMid ?? FALLBACK.mid);
  const [highlight, setHighlight] = useState(row.paletteHighlight ?? FALLBACK.highlight);
  const [aura, setAura] = useState(row.paletteAura ?? row.paletteHighlight ?? FALLBACK.aura);
  const [spread, setSpread] = useState(row.paletteSpread ?? 0);
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState("");

  const save = useUpdateElementPalette();

  const dirty =
    shadow !== (row.paletteShadow ?? FALLBACK.shadow) ||
    mid !== (row.paletteMid ?? FALLBACK.mid) ||
    highlight !== (row.paletteHighlight ?? FALLBACK.highlight) ||
    aura !== (row.paletteAura ?? row.paletteHighlight ?? FALLBACK.aura) ||
    spread !== row.paletteSpread;

  // `reason`/`impact` são exigidos pelo servidor, não enfeite: sem eles a
  // requisição volta 422. Barrar aqui evita mandar a cor e perder a edição.
  const canSave = dirty && reason.trim().length > 0 && impact.trim().length > 0;

  const submit = () => {
    save.mutate({
      code: row.code,
      paletteShadow: shadow,
      paletteMid: mid,
      paletteHighlight: highlight,
      paletteAura: aura,
      paletteSpread: spread,
      reason: reason.trim(),
      impact: impact.trim(),
    });
  };

  return (
    <section className="border-t border-graphite/30 pt-6">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-micro text-ember/70">{row.code}</span>
        <h2 className="font-display text-lg">{row.name}</h2>
        {!row.paletteMid && (
          <span className="font-mono text-micro text-ember">sem paleta — corpo neutro no jogo</span>
        )}
      </div>

      <div className="mt-5 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Ramp shadow={shadow} mid={mid} highlight={highlight} spread={spread} />
          <Backdrops shadow={shadow} mid={mid} highlight={highlight} aura={aura} />
        </div>

        <div className="space-y-3">
          <Swatch label="sombra" hint="texel mais escuro do corpo" value={shadow} onChange={setShadow} />
          <Swatch label="meio" hint="a cor que a criatura “é”" value={mid} onChange={setMid} />
          <Swatch label="brilho" hint="texel mais claro" value={highlight} onChange={setHighlight} />
          <Swatch
            label="aura"
            hint="Despertar Ancestral — mais clara que o brilho"
            value={aura}
            onChange={setAura}
          />

          <label className="block pt-2">
            <span className="font-mono text-micro uppercase tracking-widest text-graphite">
              dispersão
            </span>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={spread}
                onChange={(e) => setSpread(Number(e.target.value))}
                className="h-1 flex-1 accent-ember"
              />
              <span className="w-12 font-mono text-micro text-bone">{spread.toFixed(2)}</span>
            </div>
            <p className="mt-1 font-mono text-micro text-graphite">
              0 = todas as criaturas do elemento idênticas · 0,5 = uma pode cair na sombra
              enquanto outra cai no brilho
            </p>
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Field label="motivo" value={reason} onChange={setReason} placeholder="por que está mudando" />
        <Field label="impacto" value={impact} onChange={setImpact} placeholder="o que isso muda no jogo" />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          disabled={!canSave || save.isPending}
          onClick={submit}
          className={cn(
            "border px-4 py-2 font-mono text-micro uppercase tracking-widest transition-colors",
            canSave && !save.isPending
              ? "border-ember/60 text-ember hover:bg-ember/10"
              : "border-graphite/30 text-graphite",
          )}
        >
          {save.isPending ? "gravando…" : "gravar"}
        </button>
        {dirty && !canSave && !save.isPending && (
          <span className="font-mono text-micro text-graphite">
            motivo e impacto são obrigatórios — o changelog não aceita mudança anônima
          </span>
        )}
        {save.isError && (
          <span className="font-mono text-micro text-ember">{String(save.error)}</span>
        )}
        {save.isSuccess && !dirty && (
          <span className="font-mono text-micro text-moss">
            gravado — versão {(save.data as { version?: string })?.version}. Rode{" "}
            <code>pnpm db:dump</code> e <code>pnpm game:export</code>.
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * A rampa como o shader a lê: paradas em 0, 0,5 e 1. As marcas mostram onde a
 * dispersão pode empurrar uma criatura — é a diferença entre "o elemento tem
 * essa cor" e "o elemento tem essa faixa".
 */
function Ramp({
  shadow,
  mid,
  highlight,
  spread,
}: {
  shadow: string;
  mid: string;
  highlight: string;
  spread: number;
}) {
  return (
    <div>
      <div
        className="h-16 w-full border border-graphite/30"
        style={{
          background: `linear-gradient(to right, ${shadow} 0%, ${mid} 50%, ${highlight} 100%)`,
        }}
      />
      <div className="relative mt-1 h-4">
        <span className="absolute left-0 font-mono text-micro text-graphite">sombra</span>
        <span className="absolute left-1/2 -translate-x-1/2 font-mono text-micro text-graphite">
          meio
        </span>
        <span className="absolute right-0 font-mono text-micro text-graphite">brilho</span>
      </div>
      {spread > 0 && (
        <div className="relative mt-1 h-3">
          <div
            className="absolute top-0 h-3 border-x border-ember/60"
            style={{
              left: `${Math.max(0, 50 - spread * 100)}%`,
              right: `${Math.max(0, 50 - spread * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

/** A rampa contra os fundos onde ela vai ser vista de verdade. */
function Backdrops({
  shadow,
  mid,
  highlight,
  aura,
}: {
  shadow: string;
  mid: string;
  highlight: string;
  aura: string;
}) {
  return (
    <div className="space-y-1">
      {SCENE_BACKDROPS.map((bg) => (
        <div key={bg.hex} className="flex items-center gap-3">
          <span className="w-24 shrink-0 font-mono text-micro text-graphite">{bg.label}</span>
          <div
            className="flex flex-1 items-center gap-2 border border-graphite/20 px-3 py-2"
            style={{ background: bg.hex }}
          >
            {[shadow, mid, highlight].map((c, i) => (
              <span key={i} className="h-5 w-8 rounded-sm" style={{ background: c }} />
            ))}
            <span
              className="ml-auto h-5 w-8 rounded-full"
              style={{ background: aura, boxShadow: `0 0 10px 2px ${aura}` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Swatch({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-9 w-12 shrink-0 cursor-pointer border border-graphite/40 bg-transparent"
      />
      <span className="w-20 shrink-0 font-mono text-micro uppercase tracking-widest text-graphite">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="w-24 border border-graphite/40 bg-slate px-2 py-1 font-mono text-micro text-bone"
      />
      <span className="font-mono text-micro text-graphite">{hint}</span>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-micro uppercase tracking-widest text-graphite">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-graphite/40 bg-slate px-3 py-2 text-xs text-bone placeholder:text-graphite/60"
      />
    </label>
  );
}
