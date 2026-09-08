/**
 * First curated batch of Paleozoic creatures — 15 arthropods.
 *
 * Tullimonstrum (CRT-012) used to be here under a provisional "Incertos"
 * class. It was dropped when the roster was scoped to three lineages:
 * Artropodes, Sinapsideos and Sauropsideos.
 *
 * The per-creature awakening block each row used to carry (`DSP-*`, kind,
 * reference species) was removed in 2026-09 when the `awakenings` table was
 * dropped — the Despertar Ancestral became a universal combat buff.
 *
 * Idempotent: upserts by `code`. Written to the DB directly,
 * bypassing the API's terminology validator, which is appropriate for
 * bulk seeding — a single hand-written changelog entry summarises the batch.
 *
 * The source table used the deprecated "Evolução" / "Forma Ancestral" terms;
 * the notes below already use the official "Despertar Ancestral" vocabulary.
 *
 * Called from `seed/index.ts` right after the xlsx pass so the class /
 * element / map / biome codes referenced here exist.
 */
import { eq, sql as dsql } from "drizzle-orm";
import type { Database } from "../../client";
import { schema } from "../../index";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// input data
// ---------------------------------------------------------------------------

interface Row {
  code: string;
  species: string; // "Espécie Base" from the source table
  classCode: string; // must exist in creature_classes
  elementCode: string; // must exist in elements
  mapCode: string | null;
  biomeCode: string | null;
}

// Element mapping (existing seed):
//   ELE-001 Fogo   ELE-002 Agua   ELE-003 Natureza   ELE-004 Terra
//   ELE-005 Eletricidade
// Class mapping — the three lineages in scope (in-world name / real clade):
//   CLS-001 Loricati / artropodes   CLS-002 Theria / sinapsideos
//   CLS-003 Draconis / sauropsideos
// Map / biome:
//   PZ-01 Paleozoico costa/mar raso   BIO-001 Mar raso
const AQ = "BIO-001";
const PZ = "PZ-01";

const ROWS: Row[] = [
  {
    code: "CRT-001", species: "Trilobita", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
  },
  {
    code: "CRT-002", species: "Anomalocaris", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
  },
  {
    code: "CRT-003", species: "Opabinia", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
  },
  {
    code: "CRT-004", species: "Wiwaxia", classCode: "CLS-001", elementCode: "ELE-004",
    mapCode: PZ, biomeCode: AQ,
  },
  {
    code: "CRT-005", species: "Hallucigenia", classCode: "CLS-001", elementCode: "ELE-003",
    mapCode: PZ, biomeCode: AQ,
  },
  {
    code: "CRT-006", species: "Eurypterus", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
  },
  {
    code: "CRT-007", species: "Jaekelopterus", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
  },
  {
    code: "CRT-008", species: "Arthropleura", classCode: "CLS-001", elementCode: "ELE-003",
    mapCode: PZ, biomeCode: null,
  },
  {
    code: "CRT-009", species: "Meganeura", classCode: "CLS-001", elementCode: "ELE-003",
    mapCode: PZ, biomeCode: null,
  },
  {
    code: "CRT-010", species: "Pulmonoscorpius", classCode: "CLS-001", elementCode: "ELE-001",
    mapCode: PZ, biomeCode: null,
  },
  {
    code: "CRT-011", species: "Rhyniognatha", classCode: "CLS-001", elementCode: "ELE-003",
    mapCode: PZ, biomeCode: null,
  },
  {
    code: "CRT-013", species: "Aegirocassis", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
  },
  {
    code: "CRT-014", species: "Hurdia", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
  },
  {
    code: "CRT-015", species: "Odaraia", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
  },
  {
    code: "CRT-016", species: "Ceratiocaris", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
  },
];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveId(tx: Tx, table: any, code: string, label: string): Promise<number> {
  const rows = await tx.select({ id: table.id }).from(table).where(eq(table.code, code)).limit(1);
  if (!rows[0]) throw new Error(`${label}: '${code}' does not exist`);
  return rows[0].id;
}

async function upsertCreature(tx: Tx, row: Row): Promise<number> {
  const [classId, elementId] = await Promise.all([
    resolveId(tx, schema.creatureClasses, row.classCode, "classCode"),
    resolveId(tx, schema.elements, row.elementCode, "elementCode"),
  ]);
  const mapId = row.mapCode ? await resolveId(tx, schema.gameMaps, row.mapCode, "mapCode") : null;
  const biomeId = row.biomeCode ? await resolveId(tx, schema.biomes, row.biomeCode, "biomeCode") : null;

  const patch = {
    originalName: row.species,
    baseSpecies: row.species,
    classId,
    elementId,
    mapId,
    biomeId,
    status: "Rascunho",
    updatedAt: new Date(),
  };

  const existing = await tx
    .select({ id: schema.creatures.id })
    .from(schema.creatures)
    .where(eq(schema.creatures.code, row.code))
    .limit(1);

  if (existing[0]) {
    await tx.update(schema.creatures).set(patch).where(eq(schema.creatures.code, row.code));
    return existing[0].id;
  }
  const inserted = await tx
    .insert(schema.creatures)
    .values({ code: row.code, ...patch })
    .returning({ id: schema.creatures.id });
  return inserted[0]!.id;
}

async function computeNextVersion(tx: Tx): Promise<string> {
  // Same shape as apps/api's changelog helper — inlined to avoid a
  // cross-package dep from packages/db → apps/api.
  const rows = await tx
    .select({
      minor: dsql<number>`COALESCE(MAX(CAST(SPLIT_PART(${schema.changelog.version}, '.', 2) AS INTEGER)), 0)`,
    })
    .from(schema.changelog);
  const minor = Number(rows[0]?.minor ?? 0);
  return `0.${String(minor + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// entrypoint
// ---------------------------------------------------------------------------

/**
 * Applies the batch inside a single transaction. Safe to re-run — every row
 * is upserted by `code`. Skips writing a new changelog entry when nothing
 * actually changed (all creatures already at their expected values).
 */
export async function seedPaleozoicBatch1(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    // If a prior run already recorded this batch, don't add another changelog
    // entry. We detect by looking for our marker change string.
    const marker = "Import: Paleozoic batch 1";
    const already = await tx
      .select({ id: schema.changelog.id })
      .from(schema.changelog)
      .where(eq(schema.changelog.change, marker))
      .limit(1);

    let count = 0;
    for (const row of ROWS) {
      await upsertCreature(tx, row);
      count++;
    }

    if (already.length === 0) {
      const version = await computeNextVersion(tx);
      await tx.insert(schema.changelog).values({
        version,
        change: marker,
        reason: `first curated batch of Paleozoic content (${count} creatures)`,
        impact: "PZ-01 bestiary populated for browsing and design iteration",
        entity: null,
        entityId: null,
      });
      console.log(`  paleozoic batch 1: ${count} creatures upserted; changelog ${version}`);
    } else {
      console.log(`  paleozoic batch 1: ${count} creatures re-synced (changelog unchanged)`);
    }
  });
}
