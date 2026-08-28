/**
 * Minimum reference data every install needs: the 5 base elements, the 3
 * biological classes the game works with, the first Paleozoic map (PZ-01)
 * and one biome (Mar raso).
 *
 * Scope note: the roster is deliberately limited to Artropodes, Sinapsideos
 * and Sauropsideos. "Vertebrados Primitivos" and "Incertos" used to live
 * here and were dropped — creatures outside those three lineages are out of
 * scope, so seeding the classes back would just give the prune step in
 * `creature-numbers.ts` something to delete on every run.
 *
 * These used to be sourced from the xlsx but got promoted to
 * code so the repo bootstraps end-to-end without the .xlsx being present
 * on the host — critical for prod, where the fontes/ folder is empty.
 *
 * Idempotent — upsert by `code`. Writes a single changelog entry the first
 * time it runs and stays quiet on subsequent runs.
 */
import { eq, sql as dsql } from "drizzle-orm";
import type { Database } from "../../client";
import { schema } from "../../index";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------

const ELEMENTS = [
  { code: "ELE-001", name: "Fogo", notes: "Elemento inicial" },
  { code: "ELE-002", name: "Agua", notes: "Elemento inicial" },
  { code: "ELE-003", name: "Natureza", notes: "Elemento inicial" },
  { code: "ELE-004", name: "Terra", notes: "Elemento inicial" },
  { code: "ELE-005", name: "Eletricidade", notes: "Elemento inicial" },
] as const;

/**
 * The three rows this frozen bootstrap has always owned, kept current on
 * purpose: `upsertClass` below overwrites `name` on rows that already exist,
 * so a stale value here silently reverts a rename on the next bootstrap. When
 * the classes stopped being lineages in 2026-08 these three were renamed
 * through the API, and this list had to follow or `pnpm db:reset` would have
 * put Loricati/Theria/Draconis back.
 *
 * **CLS-004 and CLS-005 are deliberately absent.** They were created through
 * the API, which is where content belongs; adding them here would be a new
 * content batch in a frozen seed, with no changelog and no version. A machine
 * bootstrapped from `db:reset` gets three classes and an incomplete catalog —
 * which is what `db:reset` has always meant. `pnpm db:restore` is the command
 * that hydrates a real catalog.
 */
const CLASSES = [
  {
    code: "CLS-001",
    name: "Arambi",
    primaryStat: "defense",
    description:
      "Especialistas em Defesa. Criaturas resistentes, blindadas ou protegidas por couracas e estruturas defensivas.",
    status: "Definida",
  },
  {
    code: "CLS-002",
    name: "Kaira",
    primaryStat: "attack",
    description:
      "Especialistas em Ataque. Criaturas voltadas a ofensiva, predacao e dano direto.",
    status: "Definida",
  },
  {
    code: "CLS-003",
    name: "Yaruki",
    primaryStat: "speed",
    description:
      "Especialistas em Velocidade de Ataque. Criaturas rapidas, ageis e capazes de atacar em alta frequencia.",
    status: "Definida",
  },
] as const;

const MAPS = [
  {
    code: "PZ-01",
    era: "paleozoic" as const,
    name: "PZ-01",
    sortOrder: 1,
    biomeProgressionRaw: "Costa > Mar raso > Pantanos > Floresta > Regiao vulcanica",
    status: "Rascunho",
  },
] as const;

const BIOMES = [
  {
    code: "BIO-001",
    name: "Mar raso",
    predominantElements: "Agua",
    notes: "Zona inicial de artropodes aquaticos",
  },
] as const;

// ---------------------------------------------------------------------------
// upsert helpers — each returns 1 if a row was newly inserted, else 0
// ---------------------------------------------------------------------------

async function upsertElement(tx: Tx, row: (typeof ELEMENTS)[number]): Promise<number> {
  const existing = await tx
    .select({ id: schema.elements.id })
    .from(schema.elements)
    .where(eq(schema.elements.code, row.code))
    .limit(1);
  if (existing[0]) {
    await tx
      .update(schema.elements)
      .set({ name: row.name, notes: row.notes, updatedAt: new Date() })
      .where(eq(schema.elements.code, row.code));
    return 0;
  }
  await tx.insert(schema.elements).values(row);
  return 1;
}

async function upsertClass(tx: Tx, row: (typeof CLASSES)[number]): Promise<number> {
  const existing = await tx
    .select({ id: schema.creatureClasses.id })
    .from(schema.creatureClasses)
    .where(eq(schema.creatureClasses.code, row.code))
    .limit(1);
  if (existing[0]) {
    await tx
      .update(schema.creatureClasses)
      .set({
        name: row.name,
        primaryStat: row.primaryStat,
        status: row.status,
        updatedAt: new Date(),
      })
      .where(eq(schema.creatureClasses.code, row.code));
    return 0;
  }
  await tx.insert(schema.creatureClasses).values(row);
  return 1;
}

async function upsertMap(tx: Tx, row: (typeof MAPS)[number]): Promise<number> {
  const existing = await tx
    .select({ id: schema.gameMaps.id })
    .from(schema.gameMaps)
    .where(eq(schema.gameMaps.code, row.code))
    .limit(1);
  if (existing[0]) {
    await tx
      .update(schema.gameMaps)
      .set({
        era: row.era,
        name: row.name,
        sortOrder: row.sortOrder,
        biomeProgressionRaw: row.biomeProgressionRaw,
        status: row.status,
        updatedAt: new Date(),
      })
      .where(eq(schema.gameMaps.code, row.code));
    return 0;
  }
  await tx.insert(schema.gameMaps).values(row);
  return 1;
}

async function upsertBiome(tx: Tx, row: (typeof BIOMES)[number]): Promise<number> {
  const existing = await tx
    .select({ id: schema.biomes.id })
    .from(schema.biomes)
    .where(eq(schema.biomes.code, row.code))
    .limit(1);
  if (existing[0]) {
    await tx
      .update(schema.biomes)
      .set({
        name: row.name,
        predominantElements: row.predominantElements,
        notes: row.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.biomes.code, row.code));
    return 0;
  }
  await tx.insert(schema.biomes).values(row);
  return 1;
}

async function computeNextVersion(tx: Tx): Promise<string> {
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

export async function seedReferenceData(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    const marker = "Import: reference data";
    const already = await tx
      .select({ id: schema.changelog.id })
      .from(schema.changelog)
      .where(eq(schema.changelog.change, marker))
      .limit(1);

    let inserted = 0;
    for (const row of ELEMENTS) inserted += await upsertElement(tx, row);
    for (const row of CLASSES) inserted += await upsertClass(tx, row);
    for (const row of MAPS) inserted += await upsertMap(tx, row);
    for (const row of BIOMES) inserted += await upsertBiome(tx, row);

    const total = ELEMENTS.length + CLASSES.length + MAPS.length + BIOMES.length;

    if (already.length === 0) {
      const version = await computeNextVersion(tx);
      await tx.insert(schema.changelog).values({
        version,
        change: marker,
        reason: `bootstrap of the minimum data every install needs (${total} rows)`,
        impact:
          "5 elements + 4 classes + PZ-01 map + Mar raso biome, seeded from code so the repo works without the xlsx",
        entity: null,
        entityId: null,
      });
      console.log(
        `  reference data: ${inserted} inserted, ${total - inserted} updated; changelog ${version}`,
      );
    } else {
      console.log(
        `  reference data: ${inserted} inserted, ${total - inserted} updated (changelog unchanged)`,
      );
    }
  });
}
