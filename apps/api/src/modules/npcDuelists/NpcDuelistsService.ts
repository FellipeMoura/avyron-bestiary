import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import {
  NPC_DUELIST_FIELDS,
  type BatchUpsertNpcDuelistsBody,
  type UpsertNpcDuelistBody,
} from "./NpcDuelistsTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface DuelistInput {
  npcCode: string;
  opponentCreatureCode: string;
  opponentLevel: number;
  grantsGlyphCode?: string | null;
  notes?: string | null;
}

/**
 * Resolve the three codes and refuse a duel row on an NPC that is not a
 * duelist.
 *
 * The role check is not decoration: `role` is what decides which screen the
 * game opens on interaction, so a duel attached to a merchant would be data
 * the game can never reach — and `WorldPopulator` only looks for duelists
 * when it places arenas. Better a 422 naming the role than a row nobody
 * reads.
 */
async function resolveDuelist(tx: Tx, item: DuelistInput) {
  const npcRows = await tx
    .select({ id: schema.npcs.id, role: schema.npcs.role })
    .from(schema.npcs)
    .where(eq(schema.npcs.code, item.npcCode))
    .limit(1);
  const npc = npcRows[0];
  if (!npc) throw new AppError(`npcCode: '${item.npcCode}' does not exist`, 422);
  if (npc.role !== "duelist") {
    throw new AppError(
      `npcCode: '${item.npcCode}' has role '${npc.role}' — a duel row requires role 'duelist'`,
      422,
    );
  }

  const opponentCreatureId = await resolveCodeInTx(
    tx,
    schema.creatures,
    item.opponentCreatureCode,
    "opponentCreatureCode",
  );
  const grantsGlyphId = item.grantsGlyphCode
    ? await resolveCodeInTx(tx, schema.glyphs, item.grantsGlyphCode, "grantsGlyphCode")
    : null;

  return {
    npcId: npc.id,
    payload: {
      opponentCreatureId,
      opponentLevel: item.opponentLevel,
      grantsGlyphId,
      notes: item.notes ?? null,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function writeOne(tx: Tx, item: DuelistInput): Promise<number> {
  const { npcId, payload } = await resolveDuelist(tx, item);
  const inserted = await tx
    .insert(schema.npcDuelists)
    .values({ npcId, ...payload })
    .onConflictDoUpdate({
      target: schema.npcDuelists.npcId,
      set: { ...payload, updatedAt: new Date() },
    })
    .returning({ id: schema.npcDuelists.id })
    .catch((err) => {
      // The only other unique here is `grants_glyph_id` — one Glifo, one arena.
      if (isUniqueViolation(err)) {
        throw new AppError(
          `grantsGlyphCode: '${item.grantsGlyphCode}' is already granted by another arena`,
          409,
        );
      }
      throw err;
    });
  return inserted[0]!.id;
}

export const npcDuelistsService = {
  async list(params: {
    limit: number;
    offset: number;
    fields?: string;
    npcCode?: string;
    glyphCode?: string;
  }) {
    const fields = parseFields(params.fields, NPC_DUELIST_FIELDS);
    const projection = buildProjection(
      schema.npcDuelists as unknown as Record<string, unknown>,
      fields,
    );
    const [npcId, glyphId] = await Promise.all([
      resolveOptionalCode(schema.npcs, params.npcCode, "npcCode"),
      resolveOptionalCode(schema.glyphs, params.glyphCode, "glyphCode"),
    ]);
    const filters = [];
    if (npcId !== null) filters.push(eq(schema.npcDuelists.npcId, npcId));
    if (glyphId !== null) filters.push(eq(schema.npcDuelists.grantsGlyphId, glyphId));
    const q = projection
      ? db.select(projection).from(schema.npcDuelists)
      : db.select().from(schema.npcDuelists);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.npcDuelists.npcId))
      .limit(params.limit)
      .offset(params.offset);
  },

  async getByParentCode(code: string) {
    const npcId = await resolveOptionalCode(schema.npcs, code, "npcCode");
    const rows = await db
      .select()
      .from(schema.npcDuelists)
      .where(eq(schema.npcDuelists.npcId, npcId!))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AppError(`Duel for '${code}' not found`, 404);
    return row;
  },

  async upsert(body: UpsertNpcDuelistBody): Promise<{ code: string; version: string }> {
    return db.transaction(async (tx) => {
      const id = await writeOne(tx, body);
      const grant = body.grantsGlyphCode
        ? `grants ${body.grantsGlyphCode}`
        : "grants no glyph";
      const version = await recordChange(tx, {
        change: `Duel for ${body.npcCode} set (${body.opponentCreatureCode} lv ${body.opponentLevel}, ${grant})`,
        reason: body.reason,
        impact: body.impact,
        entity: "npc_duelists",
        entityId: id,
      });
      return { code: body.npcCode, version };
    });
  },

  async batchUpsert(
    body: BatchUpsertNpcDuelistsBody,
  ): Promise<{ codes: string[]; version: string }> {
    return db.transaction(async (tx) => {
      const codes: string[] = [];
      // Sequential for the same reason the child-upsert factory is: a bad
      // code mid-batch should surface naming the row that carried it.
      for (const item of body.items) {
        await writeOne(tx, item);
        codes.push(item.npcCode);
      }
      const version = await recordChange(tx, {
        change: `${codes.length} duels upserted in batch (${codes.join(", ")})`,
        reason: body.reason,
        impact: body.impact,
        entity: "npc_duelists",
      });
      return { codes, version };
    });
  },
};
