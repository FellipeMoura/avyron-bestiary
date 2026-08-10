import { and, asc, ilike } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import { createSimpleCrudService } from "../../shared/services/crudFactory";
import { buildProjection, parseFields } from "../../shared/services/query";
import { ELEMENT_FIELDS } from "./ElementsTypes";

const base = createSimpleCrudService({
  table: schema.elements,
  entityName: "elements",
  humanName: "Element",
  allowedFields: ELEMENT_FIELDS,
  displayField: "name",
  codePrefix: "ELE",
});

interface ListParams {
  limit: number;
  offset: number;
  fields?: string;
  name?: string;
}

// list() is overridden here because elements has a `?name=` filter that
// the factory doesn't know about. Reuses parseFields/buildProjection.
export const elementsService = {
  ...base,
  async list(params: ListParams) {
    const fields = parseFields(params.fields, ELEMENT_FIELDS);
    const projection = buildProjection(
      schema.elements as unknown as Record<string, unknown>,
      fields,
    );
    const filters = params.name ? [ilike(schema.elements.name, `%${params.name}%`)] : [];
    const q = projection
      ? db.select(projection).from(schema.elements)
      : db.select().from(schema.elements);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.elements.code))
      .limit(params.limit)
      .offset(params.offset);
  },
};
