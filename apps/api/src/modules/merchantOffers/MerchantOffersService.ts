import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import { MERCHANT_OFFER_FIELDS } from "./MerchantOffersTypes";
import type { BatchUpsertMerchantOffersBody, UpsertMerchantOfferBody } from "./MerchantOffersTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface ResolvedOffer {
  npcId: number;
  itemId: number;
  price: number | null;
  sortOrder: number;
}

async function resolveOffer(
  tx: Tx,
  offer: { npcCode: string; itemCode: string; price?: number | null; sortOrder?: number },
): Promise<ResolvedOffer> {
  const [npcId, itemId] = await Promise.all([
    resolveCodeInTx(tx, schema.npcs, offer.npcCode, "npcCode"),
    resolveCodeInTx(tx, schema.items, offer.itemCode, "itemCode"),
  ]);
  return {
    npcId,
    itemId,
    price: offer.price ?? null,
    sortOrder: offer.sortOrder ?? 0,
  };
}

async function upsertResolved(tx: Tx, resolved: ResolvedOffer): Promise<number> {
  const rows = await tx
    .insert(schema.merchantOffers)
    .values(resolved)
    .onConflictDoUpdate({
      target: [schema.merchantOffers.npcId, schema.merchantOffers.itemId],
      set: { price: resolved.price, sortOrder: resolved.sortOrder, updatedAt: new Date() },
    })
    .returning({ id: schema.merchantOffers.id });
  return rows[0]!.id;
}

export const merchantOffersService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    npcCode?: string;
    itemCode?: string;
  }) {
    const fields = parseFields(params.fields, MERCHANT_OFFER_FIELDS);
    const projection = buildProjection(
      schema.merchantOffers as unknown as Record<string, unknown>,
      fields,
    );

    const [npcId, itemId] = await Promise.all([
      resolveOptionalCode(schema.npcs, params.npcCode, "npcCode"),
      resolveOptionalCode(schema.items, params.itemCode, "itemCode"),
    ]);

    const filters = [];
    if (npcId !== null) filters.push(eq(schema.merchantOffers.npcId, npcId));
    if (itemId !== null) filters.push(eq(schema.merchantOffers.itemId, itemId));

    const q = projection
      ? db.select(projection).from(schema.merchantOffers)
      : db.select().from(schema.merchantOffers);

    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.merchantOffers.sortOrder), asc(schema.merchantOffers.id))
      .limit(params.limit)
      .offset(params.offset);
  },

  async upsert(body: UpsertMerchantOfferBody) {
    return db.transaction(async (tx) => {
      const resolved = await resolveOffer(tx, body);
      const id = await upsertResolved(tx, resolved);
      const priceLabel = resolved.price === null ? "base price" : `price=${resolved.price}`;
      const version = await recordChange(tx, {
        change: `Merchant ${body.npcCode} offers ${body.itemCode} at ${priceLabel}`,
        reason: body.reason,
        impact: body.impact,
        entity: "merchant_offers",
        entityId: id,
      });
      return { id, version };
    });
  },

  async batchUpsert(body: BatchUpsertMerchantOffersBody) {
    const { reason, impact, items } = body;
    return db.transaction(async (tx) => {
      const resolvedRows = await Promise.all(items.map((offer) => resolveOffer(tx, offer)));
      const ids = await Promise.all(resolvedRows.map((r) => upsertResolved(tx, r)));
      const version = await recordChange(tx, {
        change: `${ids.length} merchant offers upserted in batch`,
        reason,
        impact,
        entity: "merchant_offers",
      });
      return { ids, version };
    });
  },
};
