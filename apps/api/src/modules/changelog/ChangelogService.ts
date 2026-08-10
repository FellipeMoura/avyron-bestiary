import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import { AppError } from "../../shared/AppError";

export const changelogService = {
  async list(params: {
    limit: number;
    offset: number;
    entity?: string;
    entityId?: number;
  }) {
    const filters = [];
    if (params.entity) filters.push(eq(schema.changelog.entity, params.entity));
    if (params.entityId !== undefined)
      filters.push(eq(schema.changelog.entityId, params.entityId));
    return db
      .select()
      .from(schema.changelog)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(schema.changelog.date), desc(schema.changelog.id))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getByVersion(version: string) {
    const rows = await db
      .select()
      .from(schema.changelog)
      .where(eq(schema.changelog.version, version))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`Changelog version '${version}' not found`, 404);
    return row;
  },
};
