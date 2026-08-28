import { asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { buildProjection, parseFields } from "../../shared/services/query";
import {
  EQUIPMENT_FIELDS,
  type BatchCreateEquipmentBody,
  type CreateEquipmentBody,
  type UpdateEquipmentBody,
} from "./EquipmentTypes";

interface ListParams {
  limit: number;
  offset: number;
  fields?: string;
  slot?: "amplifier" | "enchanter";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/**
 * No FK resolution step here, unlike every other catalog module: an
 * equipment row references nothing. `slot` is an enum and the recipe lives
 * in its own junction, so there is nothing to translate from code to id.
 */
function toRow(
  body: Omit<CreateEquipmentBody, "reason" | "impact">,
): typeof schema.equipment.$inferInsert {
  return {
    code: body.code,
    name: body.name,
    slot: body.slot,
    effect: body.effect ?? null,
    notes: body.notes ?? null,
  };
}

export const equipmentService = {
  async list(params: ListParams) {
    const fields = parseFields(params.fields, EQUIPMENT_FIELDS);
    const projection = buildProjection(schema.equipment as unknown as Record<string, unknown>, fields);

    const q = projection
      ? db.select(projection).from(schema.equipment)
      : db.select().from(schema.equipment);
    return q
      .where(params.slot ? eq(schema.equipment.slot, params.slot) : undefined)
      .orderBy(asc(schema.equipment.code))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getByCode(code: string) {
    const rows = await db
      .select()
      .from(schema.equipment)
      .where(eq(schema.equipment.code, code))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`Equipment '${code}' not found`, 404);
    return row;
  },

  async create(body: CreateEquipmentBody): Promise<{ code: string; version: string }> {
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.equipment)
        .values(toRow(body))
        .returning({ id: schema.equipment.id, code: schema.equipment.code })
        .catch((err) => {
          if (isUniqueViolation(err)) throw new AppError(`code: '${body.code}' already exists`, 409);
          throw err;
        });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Equipment ${row.code} created (${body.name}, slot ${body.slot})`,
        reason: body.reason,
        impact: body.impact,
        entity: "equipment",
        entityId: row.id,
      });
      return { code: row.code, version };
    });
  },

  async update(code: string, body: UpdateEquipmentBody): Promise<{ code: string; version: string }> {
    const { reason, impact, ...patchInput } = body;
    const patchKeys = Object.keys(patchInput);
    if (patchKeys.length === 0) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.equipment.id })
        .from(schema.equipment)
        .where(eq(schema.equipment.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Equipment '${code}' not found`, 404);

      await tx
        .update(schema.equipment)
        .set({ ...patchInput, updatedAt: new Date() })
        .where(eq(schema.equipment.code, code));

      const version = await recordChange(tx, {
        change: `Equipment ${code} updated (${patchKeys.join(", ")})`,
        reason,
        impact,
        entity: "equipment",
        entityId: row.id,
      });
      return { code, version };
    });
  },

  async batchCreate(body: BatchCreateEquipmentBody): Promise<{ codes: string[]; version: string }> {
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.equipment)
        .values(body.items.map(toRow))
        .returning({ id: schema.equipment.id, code: schema.equipment.code })
        .catch((err) => {
          if (isUniqueViolation(err)) throw new AppError("code: one or more codes already exist", 409);
          throw err;
        });
      const codes = inserted.map((r) => r.code);
      const version = await recordChange(tx, {
        change: `${inserted.length} equipment models created in batch (${codes.join(", ")})`,
        reason: body.reason,
        impact: body.impact,
        entity: "equipment",
      });
      return { codes, version };
    });
  },
};
