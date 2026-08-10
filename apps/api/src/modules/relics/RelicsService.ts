import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import {
  RELIC_FIELDS,
  type BatchCreateRelicsBody,
  type CreateRelicBody,
  type UpdateRelicBody,
} from "./RelicsTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface ListParams {
  limit: number;
  offset: number;
  fields?: string;
  classCode?: string;
  elementCode?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function resolveRelicRefs(
  tx: Tx,
  body: Omit<CreateRelicBody, "reason" | "impact">,
): Promise<typeof schema.relics.$inferInsert> {
  const [elementId, classId] = await Promise.all([
    resolveCodeInTx(tx, schema.elements, body.elementCode, "elementCode"),
    resolveCodeInTx(tx, schema.creatureClasses, body.classCode, "classCode"),
  ]);
  return {
    code: body.code,
    name: body.name,
    elementId,
    classId,
    notes: body.notes ?? null,
  };
}

async function resolvePartialRelicRefs(
  tx: Tx,
  patch: Partial<Omit<CreateRelicBody, "reason" | "impact">>,
): Promise<Partial<typeof schema.relics.$inferInsert>> {
  const out: Partial<typeof schema.relics.$inferInsert> = {};
  if (patch.code !== undefined) out.code = patch.code;
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.notes !== undefined) out.notes = patch.notes ?? null;
  if (patch.elementCode !== undefined) {
    out.elementId = await resolveCodeInTx(tx, schema.elements, patch.elementCode, "elementCode");
  }
  if (patch.classCode !== undefined) {
    out.classId = await resolveCodeInTx(tx, schema.creatureClasses, patch.classCode, "classCode");
  }
  return out;
}

export const relicsService = {
  async list(params: ListParams) {
    const fields = parseFields(params.fields, RELIC_FIELDS);
    const projection = buildProjection(schema.relics as unknown as Record<string, unknown>, fields);

    const [classId, elementId] = await Promise.all([
      resolveOptionalCode(schema.creatureClasses, params.classCode, "classCode"),
      resolveOptionalCode(schema.elements, params.elementCode, "elementCode"),
    ]);

    const filters = [];
    if (classId !== null) filters.push(eq(schema.relics.classId, classId));
    if (elementId !== null) filters.push(eq(schema.relics.elementId, elementId));

    const q = projection ? db.select(projection).from(schema.relics) : db.select().from(schema.relics);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.relics.code))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getByCode(code: string) {
    const rows = await db.select().from(schema.relics).where(eq(schema.relics.code, code)).limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`Relic '${code}' not found`, 404);
    return row;
  },

  async create(body: CreateRelicBody): Promise<{ code: string; version: string }> {
    return db.transaction(async (tx) => {
      const data = await resolveRelicRefs(tx, body);
      const inserted = await tx
        .insert(schema.relics)
        .values(data)
        .returning({ id: schema.relics.id, code: schema.relics.code })
        .catch((err) => {
          if (isUniqueViolation(err)) throw new AppError(`code: '${body.code}' already exists`, 409);
          throw err;
        });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Relic ${row.code} created (${body.name})`,
        reason: body.reason,
        impact: body.impact,
        entity: "relics",
        entityId: row.id,
      });
      return { code: row.code, version };
    });
  },

  async update(code: string, body: UpdateRelicBody): Promise<{ code: string; version: string }> {
    const { reason, impact, ...patchInput } = body;
    const patchKeys = Object.keys(patchInput);
    if (patchKeys.length === 0) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.relics.id })
        .from(schema.relics)
        .where(eq(schema.relics.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Relic '${code}' not found`, 404);

      const patch = await resolvePartialRelicRefs(tx, patchInput);
      await tx
        .update(schema.relics)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.relics.code, code));

      const version = await recordChange(tx, {
        change: `Relic ${code} updated (${patchKeys.join(", ")})`,
        reason,
        impact,
        entity: "relics",
        entityId: row.id,
      });
      return { code, version };
    });
  },

  async batchCreate(body: BatchCreateRelicsBody): Promise<{ codes: string[]; version: string }> {
    return db.transaction(async (tx) => {
      const rows = await Promise.all(body.items.map((item) => resolveRelicRefs(tx, item)));
      const inserted = await tx
        .insert(schema.relics)
        .values(rows)
        .returning({ id: schema.relics.id, code: schema.relics.code })
        .catch((err) => {
          if (isUniqueViolation(err)) throw new AppError("code: one or more codes already exist", 409);
          throw err;
        });
      const codes = inserted.map((r) => r.code);
      const version = await recordChange(tx, {
        change: `${inserted.length} relics created in batch (${codes.join(", ")})`,
        reason: body.reason,
        impact: body.impact,
        entity: "relics",
      });
      return { codes, version };
    });
  },
};
