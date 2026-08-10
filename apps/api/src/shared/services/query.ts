import { z } from "../openapi/zod";
import { AppError } from "../AppError";

/**
 * Pagination schema shared by every list endpoint. Kept small: limit maxes
 * at 500 to protect a wandering agent, offset defaults to 0.
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type Pagination = z.infer<typeof paginationSchema>;

/**
 * Parses `?fields=code,name` against a whitelist of allowed columns and
 * returns the intersection, preserving the client's order. Empty/missing
 * input means "all fields" — callers can check `fields === null` to skip
 * projection.
 *
 * Rejects unknown fields with 422 rather than silently ignoring — quieter
 * failures cost more tokens because the agent has to guess what happened.
 */
export function parseFields(
  fieldsParam: unknown,
  allowed: readonly string[],
): readonly string[] | null {
  if (fieldsParam === undefined || fieldsParam === null || fieldsParam === "") return null;
  if (typeof fieldsParam !== "string") {
    throw new AppError("fields: must be a comma-separated string", 422);
  }
  const requested = fieldsParam.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = requested.filter((f) => !allowed.includes(f));
  if (unknown.length) {
    throw new AppError(
      `fields: unknown field(s) ${unknown.join(", ")}. Valid: ${allowed.join(", ")}`,
      422,
    );
  }
  return requested;
}

/**
 * Builds a Drizzle projection object from a fields list. Pass the table.
 * Returns `undefined` when no fields were requested — call sites should
 * fall through to a plain `select()` in that case.
 *
 * The return type is intentionally loose (`any`) because the shape is
 * dynamic and fully constrained by `parseFields`, which already rejects
 * unknown columns. Chasing full type safety here fights Drizzle's
 * `SelectedFields` generic without giving any real guarantee.
 */
export function buildProjection(
  table: Record<string, unknown>,
  fields: readonly string[] | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> | undefined {
  if (!fields) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proj: Record<string, any> = {};
  for (const f of fields) proj[f] = table[f];
  return proj;
}

/**
 * Common write-time metadata every mutation must carry. Kept as a Zod
 * schema so it can be `.merge()`'d into per-resource create/update schemas.
 */
export const changeMetadataSchema = z.object({
  reason: z.string().min(3).max(500).openapi({
    description: "Por que a mudança está sendo feita. Vai para o changelog.",
    example: "6º elemento definido para expansão do Cenozoico",
  }),
  impact: z.string().min(3).max(500).openapi({
    description: "O que essa mudança afeta. Vai para o changelog.",
    example: "Habilita habilidades e criaturas de tipo Sombra",
  }),
});
