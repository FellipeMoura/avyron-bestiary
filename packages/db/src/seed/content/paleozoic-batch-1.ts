/**
 * First curated batch of Paleozoic creatures — 15 arthropods.
 *
 * Tullimonstrum (CRT-012) used to be here under a provisional "Incertos"
 * class. It was dropped when the roster was scoped to three lineages:
 * Artropodes, Sinapsideos and Sauropsideos. Its awakening went with it.
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

type AwakeningKind = "reinforcement" | "swap";

interface Row {
  code: string;
  species: string; // "Espécie Base" from the source table
  classCode: string; // must exist in creature_classes
  elementCode: string; // must exist in elements
  mapCode: string | null;
  biomeCode: string | null;
  awakening: {
    code: string;
    name: string;
    kind: AwakeningKind;
    referenceSpecies: string | null;
    notes: string;
  };
}

// Element mapping (existing seed):
//   ELE-001 Fogo   ELE-002 Agua   ELE-003 Natureza   ELE-004 Terra
//   ELE-005 Eletricidade   ELE-006 Gelo
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
    awakening: {
      code: "DSP-001", name: "Isotelus", kind: "swap", referenceSpecies: "Isotelus",
      notes: "Isotelus é um dos maiores trilobitas conhecidos. Despertar ideal por manter a identidade visual e aumentar a imponência.",
    },
  },
  {
    code: "CRT-002", species: "Anomalocaris", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
    awakening: {
      code: "DSP-002", name: "Anomalocaris Prime", kind: "reinforcement", referenceSpecies: null,
      notes: "Já é um dos maiores predadores do Cambriano. O despertar ancestral enfatiza garras, nadadeiras e armadura sem trocar de espécie.",
    },
  },
  {
    code: "CRT-003", species: "Opabinia", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
    awakening: {
      code: "DSP-003", name: "Opabinia Imperator", kind: "reinforcement", referenceSpecies: null,
      notes: "Espécie extremamente icônica pelos cinco olhos e tromba. Não possui um sucessor natural marcante, favorecendo uma interpretação própria.",
    },
  },
  {
    code: "CRT-004", species: "Wiwaxia", classCode: "CLS-001", elementCode: "ELE-004",
    mapCode: PZ, biomeCode: AQ,
    awakening: {
      code: "DSP-004", name: "Wiwaxia Colossus", kind: "reinforcement", referenceSpecies: null,
      notes: "O foco é transformar um pequeno herbívoro espinhoso em um tanque natural coberto por placas e espinhos gigantes.",
    },
  },
  {
    code: "CRT-005", species: "Hallucigenia", classCode: "CLS-001", elementCode: "ELE-003",
    mapCode: PZ, biomeCode: AQ,
    awakening: {
      code: "DSP-005", name: "Hallucigenia Rex", kind: "reinforcement", referenceSpecies: null,
      notes: "Aumenta drasticamente os espinhos e a postura corporal, preservando uma das criaturas mais estranhas do Cambriano.",
    },
  },
  {
    code: "CRT-006", species: "Eurypterus", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
    awakening: {
      code: "DSP-006", name: "Jaekelopterus", kind: "swap", referenceSpecies: "Jaekelopterus",
      notes: "Um dos despertares mais naturais da lista. Ambos pertencem ao mesmo grupo e Jaekelopterus representa seu ápice.",
    },
  },
  {
    code: "CRT-007", species: "Jaekelopterus", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
    awakening: {
      code: "DSP-007", name: "Jaekelopterus Leviathan", kind: "reinforcement", referenceSpecies: null,
      notes: "Como já representa o ápice do grupo, o despertar ancestral reforça seu papel de superpredador com armadura e tamanho maiores.",
    },
  },
  {
    code: "CRT-008", species: "Arthropleura", classCode: "CLS-001", elementCode: "ELE-003",
    mapCode: PZ, biomeCode: null,
    awakening: {
      code: "DSP-008", name: "Arthropleura Titan", kind: "reinforcement", referenceSpecies: null,
      notes: "Mantém a identidade da centopeia gigante, mas com placas reforçadas, mandíbulas maiores e aparência de montaria pesada.",
    },
  },
  {
    code: "CRT-009", species: "Meganeura", classCode: "CLS-001", elementCode: "ELE-003",
    mapCode: PZ, biomeCode: null,
    awakening: {
      code: "DSP-009", name: "Meganeuropsis", kind: "swap", referenceSpecies: "Meganeuropsis",
      notes: "Despertar baseado em uma libélula fóssil ainda maior, mantendo a coerência biológica.",
    },
  },
  {
    code: "CRT-010", species: "Pulmonoscorpius", classCode: "CLS-001", elementCode: "ELE-001",
    mapCode: PZ, biomeCode: null,
    awakening: {
      code: "DSP-010", name: "Brontoscorpio", kind: "swap", referenceSpecies: "Brontoscorpio",
      notes: "Linha bastante intuitiva entre dois escorpiões gigantes do Paleozoico.",
    },
  },
  {
    code: "CRT-011", species: "Rhyniognatha", classCode: "CLS-001", elementCode: "ELE-003",
    mapCode: PZ, biomeCode: null,
    awakening: {
      code: "DSP-011", name: "Rhyniognatha Monarch", kind: "reinforcement", referenceSpecies: null,
      notes: "Como um dos primeiros insetos conhecidos, seu despertar ancestral explora o conceito de 'rei dos insetos', sem depender de outra espécie.",
    },
  },
  {
    code: "CRT-013", species: "Aegirocassis", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
    awakening: {
      code: "DSP-013", name: "Aegirocassis Colossus", kind: "reinforcement", referenceSpecies: null,
      notes: "Já possui uma silhueta única. O despertar amplia sua imponência sem alterar seu papel ecológico.",
    },
  },
  {
    code: "CRT-014", species: "Hurdia", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
    awakening: {
      code: "DSP-014", name: "Hurdia Magnus", kind: "reinforcement", referenceSpecies: null,
      notes: "Valoriza a grande carapaça frontal, tornando-a quase um escudo natural.",
    },
  },
  {
    code: "CRT-015", species: "Odaraia", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
    awakening: {
      code: "DSP-015", name: "Odaraia Phantom", kind: "reinforcement", referenceSpecies: null,
      notes: "Despertar baseado em velocidade e furtividade, explorando seu corpo alongado e olhos destacados.",
    },
  },
  {
    code: "CRT-016", species: "Ceratiocaris", classCode: "CLS-001", elementCode: "ELE-002",
    mapCode: PZ, biomeCode: AQ,
    awakening: {
      code: "DSP-016", name: "Ceratiocaris Tyrant", kind: "reinforcement", referenceSpecies: null,
      notes: "Amplia o conceito de crustáceo blindado, enfatizando pinças e armadura em vez de trocar de espécie.",
    },
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

async function upsertAwakening(tx: Tx, creatureId: number, row: Row) {
  const a = row.awakening;
  const patch = {
    creatureId,
    name: a.name,
    type: a.kind,
    activationChancePct: a.kind === "swap" ? 30 : null,
    referenceSpecies: a.referenceSpecies,
    notes: a.notes,
    updatedAt: new Date(),
  };
  const existing = await tx
    .select({ id: schema.awakenings.id })
    .from(schema.awakenings)
    .where(eq(schema.awakenings.code, a.code))
    .limit(1);
  if (existing[0]) {
    await tx.update(schema.awakenings).set(patch).where(eq(schema.awakenings.code, a.code));
  } else {
    await tx.insert(schema.awakenings).values({ code: a.code, ...patch });
  }
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
      const creatureId = await upsertCreature(tx, row);
      await upsertAwakening(tx, creatureId, row);
      count++;
    }

    if (already.length === 0) {
      const version = await computeNextVersion(tx);
      await tx.insert(schema.changelog).values({
        version,
        change: marker,
        reason: `first curated batch of Paleozoic content (${count} creatures + awakenings)`,
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
