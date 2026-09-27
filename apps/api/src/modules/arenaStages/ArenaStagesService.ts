import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import type { Database } from "@bestiary/db";
import { AppError } from "../../shared/AppError";
import { recordChange } from "../../shared/services/changelog";
import { resolveCodeInTx, resolveOptionalCode } from "../../shared/services/fkResolver";
import { buildProjection, parseFields } from "../../shared/services/query";
import {
  ARENA_STAGE_FIELDS,
  type BatchUpsertArenaStagesBody,
  type UpsertArenaStageBody,
} from "./ArenaStagesTypes";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface StageInput {
  npcCode: string;
  stage: number;
  opponentCreatureCode: string;
  opponentLevel: number;
  rewardCurrency?: number;
  notes?: string | null;
}

/**
 * Resolve the codes and refuse a stage on an NPC that is not a duelist — same
 * check, same reason as `npc_duelists`: the game only looks for a ladder under
 * a duelist, so a stage hung on a merchant would be a row nobody reads.
 */
async function resolveStage(tx: Tx, item: StageInput) {
  const npcRows = await tx
    .select({ id: schema.npcs.id, role: schema.npcs.role })
    .from(schema.npcs)
    .where(eq(schema.npcs.code, item.npcCode))
    .limit(1);
  const npc = npcRows[0];
  if (!npc) throw new AppError(`npcCode: '${item.npcCode}' does not exist`, 422);
  if (npc.role !== "duelist") {
    throw new AppError(
      `npcCode: '${item.npcCode}' has role '${npc.role}' — an arena stage requires role 'duelist'`,
      422,
    );
  }
  const opponentCreatureId = await resolveCodeInTx(
    tx,
    schema.creatures,
    item.opponentCreatureCode,
    "opponentCreatureCode",
  );
  return {
    npcId: npc.id,
    stage: item.stage,
    payload: {
      opponentCreatureId,
      opponentLevel: item.opponentLevel,
      rewardCurrency: item.rewardCurrency ?? 0,
      notes: item.notes ?? null,
    },
  };
}

async function writeOne(tx: Tx, item: StageInput): Promise<number> {
  const { npcId, stage, payload } = await resolveStage(tx, item);
  const rows = await tx
    .insert(schema.arenaStages)
    .values({ npcId, stage, ...payload })
    .onConflictDoUpdate({
      target: [schema.arenaStages.npcId, schema.arenaStages.stage],
      set: { ...payload, updatedAt: new Date() },
    })
    .returning({ id: schema.arenaStages.id });
  return rows[0]!.id;
}

const stageKey = (item: StageInput) => `${item.npcCode}#${item.stage}`;

export const arenaStagesService = {
  async list(params: { limit: number; offset: number; fields?: string; npcCode?: string }) {
    const fields = parseFields(params.fields, ARENA_STAGE_FIELDS);
    const projection = buildProjection(
      schema.arenaStages as unknown as Record<string, unknown>,
      fields,
    );
    const npcId = await resolveOptionalCode(schema.npcs, params.npcCode, "npcCode");
    const filters = [];
    if (npcId !== null) filters.push(eq(schema.arenaStages.npcId, npcId));
    const q = projection
      ? db.select(projection).from(schema.arenaStages)
      : db.select().from(schema.arenaStages);
    return q
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.arenaStages.npcId), asc(schema.arenaStages.stage))
      .limit(params.limit)
      .offset(params.offset);
  },

  async upsert(body: UpsertArenaStageBody): Promise<{ code: string; version: string }> {
    return db.transaction(async (tx) => {
      const id = await writeOne(tx, body);
      const version = await recordChange(tx, {
        change: `Arena stage ${stageKey(body)} set (${body.opponentCreatureCode} lv ${body.opponentLevel}, reward ${body.rewardCurrency ?? 0})`,
        reason: body.reason,
        impact: body.impact,
        entity: "arena_stages",
        entityId: id,
      });
      return { code: stageKey(body), version };
    });
  },

  async batchUpsert(
    body: BatchUpsertArenaStagesBody,
  ): Promise<{ codes: string[]; version: string }> {
    return db.transaction(async (tx) => {
      const codes: string[] = [];
      // Sequential, like `npc_duelists`: a bad code mid-batch should surface
      // naming the row that carried it.
      for (const item of body.items) {
        await writeOne(tx, item);
        codes.push(stageKey(item));
      }
      const version = await recordChange(tx, {
        change: `${codes.length} arena stages upserted in batch (${codes.join(", ")})`,
        reason: body.reason,
        impact: body.impact,
        entity: "arena_stages",
      });
      return { codes, version };
    });
  },
};
