import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import { createSimpleCrudService } from "../../shared/services/crudFactory";
import { buildProjection, parseFields } from "../../shared/services/query";
import { ITEM_FIELDS } from "./ItemsTypes";

const base = createSimpleCrudService({
  table: schema.items,
  entityName: "items",
  humanName: "Item",
  allowedFields: ITEM_FIELDS,
  displayField: "name",
  codePrefix: "ITM",
});

export const itemsService = {
  ...base,
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    // Derivado da coluna, não redigitado: se `item_category` ganhar um valor,
    // o filtro acompanha sem ninguém lembrar de vir aqui.
    category?: (typeof schema.items.$inferSelect)["category"];
  }) {
    const fields = parseFields(params.fields, ITEM_FIELDS);
    const projection = buildProjection(
      schema.items as unknown as Record<string, unknown>,
      fields,
    );
    const filters = params.category ? [eq(schema.items.category, params.category)] : [];
    const q = projection ? db.select(projection).from(schema.items) : db.select().from(schema.items);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.items.code))
      .limit(params.limit)
      .offset(params.offset);
  },
};
