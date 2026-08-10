import { eq } from "drizzle-orm";
import { db } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../AppError";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;

/**
 * Look up an id by its `code` value, throwing 422 with a helpful message
 * when the code isn't found. Use inside a transaction for consistency with
 * the write that will use the returned id.
 */
export async function resolveCodeInTx(
  tx: Tx,
  table: AnyTable,
  code: string,
  fieldName: string,
): Promise<number> {
  const rows = await tx
    .select({ id: table.id })
    .from(table)
    .where(eq(table.code, code))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError(`${fieldName}: '${code}' does not exist`, 422);
  return row.id;
}

/** Non-tx version for use in list/filter queries. Returns null when code is falsy. */
export async function resolveOptionalCode(
  table: AnyTable,
  code: string | undefined | null,
  fieldName: string,
): Promise<number | null> {
  if (!code) return null;
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.code, code))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError(`${fieldName}: '${code}' does not exist`, 422);
  return row.id;
}
