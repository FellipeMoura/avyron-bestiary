export const PLACEHOLDER = "(a definir)";

export function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export function isPlaceholder(value: unknown): boolean {
  const v = clean(value);
  return v === null || v === PLACEHOLDER;
}

export function orNullIfPlaceholder(value: unknown): string | null {
  return isPlaceholder(value) ? null : clean(value);
}

/** Rows marked with EXEMPLO in the ID column are the "grey italic" examples. */
export function skipRow(id: unknown): boolean {
  const c = clean(id);
  return c === null || c.toUpperCase().startsWith("EXEMPLO");
}

export function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "untitled"
  );
}

const ERA_MAP: Record<string, "paleozoic" | "mesozoic" | "cenozoic"> = {
  paleozoico: "paleozoic",
  paleozoic: "paleozoic",
  mesozoico: "mesozoic",
  mesozoic: "mesozoic",
  cenozoico: "cenozoic",
  cenozoic: "cenozoic",
};

export function parseEra(value: unknown): "paleozoic" | "mesozoic" | "cenozoic" | null {
  const v = clean(value);
  if (!v) return null;
  return ERA_MAP[slugify(v).replace(/-/g, "")] ?? null;
}

export function parseAwakeningType(value: unknown): {
  type: "reinforcement" | "swap" | null;
  chancePct: number | null;
} {
  const v = clean(value);
  if (!v) return { type: null, chancePct: null };
  const match = v.match(/^([A-Za-zÀ-ÿ]+)\s*(?:\((\d+)\s*%\))?/);
  if (!match) return { type: null, chancePct: null };
  const word = slugify(match[1] ?? "");
  const pct = match[2] ? Number.parseInt(match[2], 10) : null;
  if (word.startsWith("reforco") || word.startsWith("reforc") || word.startsWith("reinforc")) {
    return { type: "reinforcement", chancePct: pct };
  }
  if (word.startsWith("troca") || word.startsWith("swap")) {
    return { type: "swap", chancePct: pct };
  }
  return { type: null, chancePct: pct };
}

export function parseBoolPtBr(value: unknown): boolean {
  const v = clean(value);
  return v !== null && ["sim", "true", "1", "yes"].includes(v.toLowerCase());
}

export function parseDocumentStatus(value: unknown): "defined" | "partial" | "pending" {
  const v = clean(value) ?? "";
  const low = v.toLowerCase();
  // Composed like "Definido — estrutura; Pendente — conteúdo" counts as partial.
  if (low.includes("parcial") || v.includes(";") || v.includes("—")) return "partial";
  if (low.startsWith("defin")) return "defined";
  return "pending";
}
