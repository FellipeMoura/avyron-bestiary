import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { createSimpleCrudService } from "../../shared/services/crudFactory";
import { resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import type { BatchCreateItemsBody, CreateItemBody, UpdateItemBody } from "./ItemsTypes";
import { ITEM_FIELDS } from "./ItemsTypes";

const base = createSimpleCrudService({
  table: schema.items,
  entityName: "items",
  humanName: "Item",
  allowedFields: ITEM_FIELDS,
  displayField: "name",
  codePrefix: "ITM",
});

/**
 * `classId` mirrors `category`: required iff `category === 'material'`,
 * forbidden otherwise. The DB CHECK (`items_material_class_check`) is the
 * backstop; this is what turns a constraint violation into a message that
 * names the field, matching every other 422 in this API.
 *
 * Not run inside the caller's transaction — `creature_classes` is a closed,
 * never-deleted roster (3 rows, fixed since Changelog 0.01), so the
 * TOCTOU window a plain `db` read leaves open is not a real risk here.
 */
async function resolveItemClassId(
  category: string,
  classCode: string | null | undefined,
): Promise<number | null> {
  if (category === "material") {
    if (!classCode) {
      throw new AppError("classCode: required when category is 'material'", 422);
    }
    return resolveOptionalCode(schema.creatureClasses, classCode, "classCode");
  }
  if (classCode) {
    throw new AppError(`classCode: must be omitted for category '${category}'`, 422);
  }
  return null;
}

export const itemsService = {
  ...base,
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    // Derivado da coluna, não redigitado: se `item_category` ganhar um valor,
    // o filtro acompanha sem ninguém lembrar de vir aqui.
    category?: (typeof schema.items.$inferSelect)["category"];
    classCode?: string;
  }) {
    const fields = parseFields(params.fields, ITEM_FIELDS);
    const projection = buildProjection(
      schema.items as unknown as Record<string, unknown>,
      fields,
    );
    const classId = await resolveOptionalCode(schema.creatureClasses, params.classCode, "classCode");
    const filters = [];
    if (params.category) filters.push(eq(schema.items.category, params.category));
    if (classId !== null) filters.push(eq(schema.items.classId, classId));
    const q = projection ? db.select(projection).from(schema.items) : db.select().from(schema.items);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.items.code))
      .limit(params.limit)
      .offset(params.offset);
  },

  async create(body: CreateItemBody) {
    const { classCode, ...rest } = body;
    const category = rest.category ?? "mineral";
    const classId = await resolveItemClassId(category, classCode);
    return base.create({ ...rest, classId });
  },

  async batchCreate(body: BatchCreateItemsBody) {
    const resolvedItems = await Promise.all(
      body.items.map(async (item) => {
        const { classCode, ...rest } = item;
        const category = rest.category ?? "mineral";
        const classId = await resolveItemClassId(category, classCode);
        return { ...rest, classId };
      }),
    );
    return base.batchCreate({ items: resolvedItems, reason: body.reason, impact: body.impact });
  },

  async update(code: string, body: UpdateItemBody) {
    const { classCode, ...rest } = body;

    // Only touch classId when the patch could actually change the invariant
    // — a PATCH that only updates `notes` shouldn't have to re-state classCode
    // for a material item that already has one.
    if (rest.category !== undefined || classCode !== undefined) {
      const existing = await db
        .select({ category: schema.items.category })
        .from(schema.items)
        .where(eq(schema.items.code, code))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Item '${code}' not found`, 404);

      const effectiveCategory = rest.category ?? row.category;
      const classId = await resolveItemClassId(effectiveCategory, classCode);
      return base.update(code, { ...rest, classId });
    }

    return base.update(code, rest);
  },
};
