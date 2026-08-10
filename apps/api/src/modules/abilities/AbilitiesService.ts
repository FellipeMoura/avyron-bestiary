import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import type {
  BatchCreateAbilitiesBody,
  CreateAbilityBody,
  UpdateAbilityBody,
} from "./AbilitiesTypes";
import { ABILITY_FIELDS } from "./AbilitiesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function resolveElement(tx: Tx, code: string | null | undefined): Promise<number | null> {
  if (!code) return null;
  return resolveCodeInTx(tx, schema.elements, code, "elementCode");
}

export const abilitiesService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    elementCode?: string;
    type?: string;
    awakeningOnly?: boolean;
  }) {
    const fields = parseFields(params.fields, ABILITY_FIELDS);
    const projection = buildProjection(
      schema.abilities as unknown as Record<string, unknown>,
      fields,
    );

    const elementId = await resolveOptionalCode(schema.elements, params.elementCode, "elementCode");
    const filters = [];
    if (elementId !== null) filters.push(eq(schema.abilities.elementId, elementId));
    if (params.type) filters.push(eq(schema.abilities.type, params.type));
    if (params.awakeningOnly !== undefined) {
      filters.push(eq(schema.abilities.awakeningOnly, params.awakeningOnly));
    }

    const q = projection
      ? db.select(projection).from(schema.abilities)
      : db.select().from(schema.abilities);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.abilities.code))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getByCode(code: string) {
    const rows = await db
      .select()
      .from(schema.abilities)
      .where(eq(schema.abilities.code, code))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`Ability '${code}' not found`, 404);
    return row;
  },

  async create(body: CreateAbilityBody) {
    const { reason, impact, elementCode, ...rest } = body;
    return db.transaction(async (tx) => {
      const elementId = await resolveElement(tx, elementCode);
      const inserted = await tx
        .insert(schema.abilities)
        .values({ ...rest, elementId })
        .returning({ id: schema.abilities.id, code: schema.abilities.code })
        .catch((err) => {
          if (isUniqueViolation(err)) throw new AppError(`code: '${rest.code}' already exists`, 409);
          throw err;
        });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Ability ${row.code} created (${rest.name})`,
        reason,
        impact,
        entity: "abilities",
        entityId: row.id,
      });
      return { code: row.code, version };
    });
  },

  async update(code: string, body: UpdateAbilityBody) {
    const { reason, impact, elementCode, ...patch } = body;
    const hasElementUpdate = "elementCode" in body;
    if (Object.keys(patch).length === 0 && !hasElementUpdate) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.abilities.id })
        .from(schema.abilities)
        .where(eq(schema.abilities.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Ability '${code}' not found`, 404);

      const updates: Partial<typeof schema.abilities.$inferInsert> = { ...patch };
      if (hasElementUpdate) updates.elementId = await resolveElement(tx, elementCode);

      await tx
        .update(schema.abilities)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.abilities.code, code));
      const changedKeys = Object.keys(updates).join(", ");
      const version = await recordChange(tx, {
        change: `Ability ${code} updated (${changedKeys})`,
        reason,
        impact,
        entity: "abilities",
        entityId: row.id,
      });
      return { code, version };
    });
  },

  async batchCreate(body: BatchCreateAbilitiesBody) {
    const { reason, impact, items } = body;
    return db.transaction(async (tx) => {
      const rows = await Promise.all(
        items.map(async ({ elementCode, ...rest }) => ({
          ...rest,
          elementId: await resolveElement(tx, elementCode),
        })),
      );
      const inserted = await tx
        .insert(schema.abilities)
        .values(rows)
        .returning({ id: schema.abilities.id, code: schema.abilities.code })
        .catch((err) => {
          if (isUniqueViolation(err)) throw new AppError("code: one or more codes already exist", 409);
          throw err;
        });
      const codes = inserted.map((r) => r.code);
      const version = await recordChange(tx, {
        change: `${inserted.length} abilities created in batch (${codes.join(", ")})`,
        reason,
        impact,
        entity: "abilities",
      });
      return { codes, version };
    });
  },
};
