import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny, z } from "zod";

type Source = "body" | "query" | "params";

/**
 * Runs the schema against `req[source]` and replaces the field with the parsed
 * value so the downstream handler sees the typed object. Errors bubble to
 * `handleError`, which maps ZodError -> 422.
 */
function validate<S extends ZodTypeAny>(source: Source, schema: S): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)[source] = parsed;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const validateBody = <S extends ZodTypeAny>(schema: S) => validate("body", schema);
export const validateQuery = <S extends ZodTypeAny>(schema: S) => validate("query", schema);
export const validateParams = <S extends ZodTypeAny>(schema: S) => validate("params", schema);

// Ergonomic typed request helper so controllers can annotate `req` without ceremony.
export type TypedRequest<Body = unknown, Query = unknown, Params = unknown> = Request<
  Params extends z.ZodTypeAny ? z.infer<Params> : Params,
  unknown,
  Body extends z.ZodTypeAny ? z.infer<Body> : Body,
  Query extends z.ZodTypeAny ? z.infer<Query> : Query
>;
