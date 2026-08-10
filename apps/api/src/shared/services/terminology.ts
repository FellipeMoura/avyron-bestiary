import type { RequestHandler } from "express";
import { AppError } from "../AppError";

/**
 * Deprecated terms that must never re-enter the corpus. Kept in lowercase +
 * without diacritics so the check is a single normalized `includes`.
 */
const FORBIDDEN_TERMS = [
  { term: "evolucao", display: "Evolução" },
  { term: "forma ancestral", display: "Forma Ancestral" },
  { term: "formas ancestrais", display: "Formas Ancestrais" },
] as const;

export const OFFICIAL_TERM = "Despertar Ancestral";
export const OFFICIAL_TERM_HINT =
  `Termo oficial: '${OFFICIAL_TERM}' — uma transformação temporária, com retorno à forma base.`;

function normalize(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

interface Finding {
  field: string;
  term: string;
}

/**
 * Recursively walk a JSON-like value, running `normalize().includes(term)`
 * on every string. Returns all matches so the error can list them at once.
 */
function scan(value: unknown, path: string, out: Finding[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const n = normalize(value);
    for (const { term, display } of FORBIDDEN_TERMS) {
      if (n.includes(term)) out.push({ field: path || "(root)", term: display });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scan(v, `${path}[${i}]`, out));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      scan(v, path ? `${path}.${k}` : k, out);
    }
  }
}

/**
 * Middleware. Applies only when there's a body — safe to mount on every write
 * route. Returns 422 with a listing of every offending field so an agent can
 * fix them all in one round trip instead of playing whack-a-mole.
 */
export const rejectForbiddenTerms: RequestHandler = (req, _res, next) => {
  if (!req.body || typeof req.body !== "object") return next();
  const findings: Finding[] = [];
  scan(req.body, "", findings);
  if (findings.length === 0) return next();
  const summary = findings
    .map((f) => `'${f.term}' em ${f.field}`)
    .join("; ");
  throw new AppError(
    `Terminologia descontinuada encontrada (${summary}). ${OFFICIAL_TERM_HINT}`,
    422,
    { findings },
  );
};
