import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { buildProjection, parseFields } from "../../shared/services/query";
import type {
  CreateDesignDocumentBody,
  UpdateDesignDocumentBody,
} from "./DesignDocumentsTypes";
import { DESIGN_DOCUMENT_FIELDS } from "./DesignDocumentsTypes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export const designDocumentsService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    status?: "defined" | "partial" | "pending";
  }) {
    const fields = parseFields(params.fields, DESIGN_DOCUMENT_FIELDS);
    const projection = buildProjection(
      schema.designDocuments as unknown as Record<string, unknown>,
      fields,
    );
    const filters = params.status ? [eq(schema.designDocuments.status, params.status)] : [];
    const q = projection
      ? db.select(projection).from(schema.designDocuments)
      : db.select().from(schema.designDocuments);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.designDocuments.sortOrder), asc(schema.designDocuments.slug))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getBySlug(slug: string) {
    const rows = await db
      .select()
      .from(schema.designDocuments)
      .where(eq(schema.designDocuments.slug, slug))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`Document '${slug}' not found`, 404);
    return row;
  },

  async create(body: CreateDesignDocumentBody) {
    const { reason, impact, ...data } = body;
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.designDocuments)
        .values(data)
        .returning({ id: schema.designDocuments.id, slug: schema.designDocuments.slug })
        .catch((err) => {
          if (isUniqueViolation(err)) {
            throw new AppError(`slug: '${data.slug}' already exists`, 409);
          }
          throw err;
        });
      const row = inserted[0]!;
      const version = await recordChange(tx, {
        change: `Document '${row.slug}' created (${data.title})`,
        reason,
        impact,
        entity: "design_documents",
        entityId: row.id,
      });
      return { slug: row.slug, version };
    });
  },

  async update(slug: string, body: UpdateDesignDocumentBody) {
    const { reason, impact, ...patch } = body;
    if (Object.keys(patch).length === 0) {
      throw new AppError("At least one field must be provided beyond reason/impact", 422);
    }
    return db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.designDocuments.id })
        .from(schema.designDocuments)
        .where(eq(schema.designDocuments.slug, slug))
        .limit(1);
      const row = existing[0];
      if (!row) throw new AppError(`Document '${slug}' not found`, 404);

      await tx
        .update(schema.designDocuments)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.designDocuments.slug, slug));
      const version = await recordChange(tx, {
        change: `Document '${slug}' updated (${Object.keys(patch).join(", ")})`,
        reason,
        impact,
        entity: "design_documents",
        entityId: row.id,
      });
      return { slug, version };
    });
  },
};
