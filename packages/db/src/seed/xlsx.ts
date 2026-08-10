import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import type { Database } from "../client";
import { schema } from "../index";
import {
  clean,
  isPlaceholder,
  orNullIfPlaceholder,
  parseAwakeningType,
  parseBoolPtBr,
  parseEra,
  PLACEHOLDER,
  skipRow,
} from "./helpers";

type Row = Record<string, unknown>;
// The Drizzle schema modules are typed as `PgTable`, but for a small seed
// script we accept a loose `any` — the upsert helper needs dynamic column
// access and gains nothing from being fully typed here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;

function rowsOf(ws: XLSX.WorkSheet): Row[] {
  const raw = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false });
  return raw.filter((r) => Object.values(r).some((v) => v !== null && v !== undefined && v !== ""));
}

async function loadWorkbook(path: string): Promise<XLSX.WorkBook> {
  const buf = await readFile(path);
  return XLSX.read(buf, { type: "buffer" });
}

function sheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet '${name}' not found in workbook`);
  return ws;
}

/**
 * Upsert by a logical unique column (`code`, `slug`, `version`). Returns
 * the resulting row id. Idempotent: rerunning the seed won't duplicate.
 */
async function upsertByCode(
  db: Database,
  table: AnyTable,
  codeCol: string,
  codeValue: string,
  values: Record<string, unknown>,
): Promise<number> {
  const existing = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table[codeCol], codeValue))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(table)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(table[codeCol], codeValue));
    return existing[0]!.id;
  }
  const inserted = await db
    .insert(table)
    .values({ ...values, [codeCol]: codeValue })
    .returning({ id: table.id });
  return inserted[0]!.id;
}

async function resolveByCode(
  db: Database,
  table: AnyTable,
  code: string | null | undefined,
): Promise<number | null> {
  if (!code) return null;
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.code, code)).limit(1);
  return rows[0]?.id ?? null;
}

async function resolveByName(
  db: Database,
  table: AnyTable,
  name: string | null | undefined,
): Promise<number | null> {
  if (!name) return null;
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.name, name)).limit(1);
  return rows[0]?.id ?? null;
}

export async function seedXlsx(db: Database, path: string): Promise<void> {
  console.log(`reading ${path}...`);
  const wb = await loadWorkbook(path);

  await seedElements(db, sheet(wb, "Elementos"));
  await seedClasses(db, sheet(wb, "Classes"));
  await seedMaps(db, sheet(wb, "Mapas"));
  await seedBiomes(db, sheet(wb, "Biomas"));
  await seedMapBiomes(db, sheet(wb, "Biomas"));
  await seedAbilities(db, sheet(wb, "Habilidades"));
  await seedItems(db, sheet(wb, "Itens"));
  await seedNpcs(db, sheet(wb, "NPCs"));
  await seedMissions(db, sheet(wb, "Missoes"));
  await seedCreatures(db, sheet(wb, "Criaturas"));
  await seedAwakenings(db, sheet(wb, "Despertares"));
  await seedDrops(db, sheet(wb, "Drops"));
  await seedChangelog(db, sheet(wb, "Changelog"));
}

async function seedElements(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    await upsertByCode(db, schema.elements, "code", code, {
      name: clean(row.Nome) ?? code,
      notes: orNullIfPlaceholder(row.Notas),
    });
    n++;
  }
  console.log(`  elements: ${n}`);
}

async function seedClasses(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    await upsertByCode(db, schema.creatureClasses, "code", code, {
      name: clean(row.Nome) ?? code,
      biologicalScope: orNullIfPlaceholder(row.Escopo_Biologico),
      passive: orNullIfPlaceholder(row.Passiva),
      workFunction: orNullIfPlaceholder(row.Funcao_Trabalho),
      fusionRule: orNullIfPlaceholder(row.Regra_Fusao),
      status: clean(row.Status),
    });
    n++;
  }
  console.log(`  creature_classes: ${n}`);
}

async function seedMaps(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    const era = parseEra(row.Era);
    if (!era) {
      console.warn(`  [warn] map ${code}: invalid era '${row.Era}' — skipping`);
      continue;
    }
    const name = isPlaceholder(row.Nome) ? code : (clean(row.Nome) ?? code);
    await upsertByCode(db, schema.gameMaps, "code", code, {
      era,
      name,
      sortOrder: Number.parseInt(String(row.Ordem ?? 0), 10) || 0,
      biomeProgressionRaw: orNullIfPlaceholder(row.Progressao_Biomas),
      status: clean(row.Status),
    });
    n++;
  }
  console.log(`  game_maps: ${n}`);
}

async function seedBiomes(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    await upsertByCode(db, schema.biomes, "code", code, {
      name: clean(row.Nome) ?? code,
      predominantElements: orNullIfPlaceholder(row.Elementos_Predominantes),
      notes: orNullIfPlaceholder(row.Notas),
    });
    n++;
  }
  console.log(`  biomes: ${n}`);
}

async function seedMapBiomes(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const biomeCode = clean(row.ID);
    if (skipRow(biomeCode) || !biomeCode) continue;
    const mapsCsv = clean(row.Mapas);
    if (!mapsCsv || mapsCsv === PLACEHOLDER) continue;
    const biomeId = await resolveByCode(db, schema.biomes, biomeCode);
    if (!biomeId) continue;
    const codes = mapsCsv.split(",").map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < codes.length; i++) {
      const mapCode = codes[i]!;
      const mapId = await resolveByCode(db, schema.gameMaps, mapCode);
      if (!mapId) {
        console.warn(`  [warn] biome ${biomeCode} references missing map ${mapCode} — skipping`);
        continue;
      }
      await db
        .insert(schema.mapBiomes)
        .values({ mapId, biomeId, sortOrder: i })
        .onConflictDoNothing({ target: [schema.mapBiomes.mapId, schema.mapBiomes.biomeId] });
      n++;
    }
  }
  console.log(`  map_biomes: ${n}`);
}

async function seedAbilities(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    const elementId = await resolveByName(db, schema.elements, clean(row.Elemento));
    const name = isPlaceholder(row.Nome) ? code : (clean(row.Nome) ?? code);
    await upsertByCode(db, schema.abilities, "code", code, {
      name,
      elementId,
      type: clean(row.Tipo),
      effect: orNullIfPlaceholder(row.Efeito),
      awakeningOnly: parseBoolPtBr(row.Exclusiva_do_Despertar),
      notes: clean(row.Notas),
    });
    n++;
  }
  console.log(`  abilities: ${n}`);
}

async function seedItems(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    const name = isPlaceholder(row.Nome) ? code : (clean(row.Nome) ?? code);
    await upsertByCode(db, schema.items, "code", code, {
      name,
      category: clean(row.Categoria),
      effect: orNullIfPlaceholder(row.Efeito),
      acquisition: clean(row.Obtencao),
      notes: clean(row.Notas),
    });
    n++;
  }
  console.log(`  items: ${n}`);
}

async function seedNpcs(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    const mapId = await resolveByCode(db, schema.gameMaps, clean(row.Mapa));
    const name = isPlaceholder(row.Nome) ? code : (clean(row.Nome) ?? code);
    await upsertByCode(db, schema.npcs, "code", code, {
      name,
      faction: orNullIfPlaceholder(row.Faccao),
      mapId,
      role: orNullIfPlaceholder(row.Papel),
      notes: clean(row.Notas),
    });
    n++;
  }
  console.log(`  npcs: ${n}`);
}

async function seedMissions(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    const mapId = await resolveByCode(db, schema.gameMaps, clean(row.Mapa));
    const npcId = await resolveByCode(db, schema.npcs, clean(row.NPC));
    const name = isPlaceholder(row.Nome) ? code : (clean(row.Nome) ?? code);
    await upsertByCode(db, schema.missions, "code", code, {
      name,
      type: clean(row.Tipo),
      mapId,
      npcId,
      requirement: clean(row.Requisito),
      reward: clean(row.Recompensa),
      status: clean(row.Status),
    });
    n++;
  }
  console.log(`  missions: ${n}`);
}

async function seedCreatures(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    const classId = await resolveByName(db, schema.creatureClasses, clean(row.Classe));
    const elementId = await resolveByName(db, schema.elements, clean(row.Elemento));
    if (!classId || !elementId) {
      console.warn(`  [warn] creature ${code}: unknown class/element — skipping`);
      continue;
    }
    const mapId = await resolveByCode(db, schema.gameMaps, clean(row.Mapa));
    const biomeId = await resolveByName(db, schema.biomes, clean(row.Bioma));
    const originalName = isPlaceholder(row.Nome_Original)
      ? code
      : (clean(row.Nome_Original) ?? code);
    await upsertByCode(db, schema.creatures, "code", code, {
      originalName,
      baseSpecies: clean(row.Especie_Base),
      classId,
      elementId,
      mapId,
      biomeId,
      role: clean(row.Papel),
      silhouetteNote: clean(row.Nota_Silhueta),
      status: clean(row.Status),
    });
    n++;
  }
  console.log(`  creatures: ${n}`);
}

async function seedAwakenings(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    const creatureId = await resolveByCode(db, schema.creatures, clean(row.Criatura_ID));
    if (!creatureId) {
      console.warn(`  [warn] awakening ${code}: missing creature ${row.Criatura_ID} — skipping`);
      continue;
    }
    const { type, chancePct } = parseAwakeningType(row.Tipo);
    if (!type) {
      console.warn(`  [warn] awakening ${code}: invalid type '${row.Tipo}' — skipping`);
      continue;
    }
    const name = isPlaceholder(row.Nome_Despertar) ? code : (clean(row.Nome_Despertar) ?? code);
    await upsertByCode(db, schema.awakenings, "code", code, {
      creatureId,
      name,
      type,
      activationChancePct: chancePct,
      referenceSpecies: clean(row.Especie_Referencia),
      visualChanges: clean(row.Mudancas_Visuais),
      notes: clean(row.Notas),
    });
    n++;
  }
  console.log(`  awakenings: ${n}`);
}

async function seedDrops(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const code = clean(row.ID);
    if (skipRow(code) || !code) continue;
    const creatureId = await resolveByCode(db, schema.creatures, clean(row.Criatura_ID));
    const itemId = await resolveByCode(db, schema.items, clean(row.Item_ID));
    if (!creatureId || !itemId) {
      console.warn(`  [warn] drop ${code}: missing creature/item — skipping`);
      continue;
    }
    const chance = Number.parseFloat(String(row.Chance ?? ""));
    if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
      console.warn(`  [warn] drop ${code}: invalid chance — skipping`);
      continue;
    }
    const condition = clean(row.Condicao);
    await db
      .insert(schema.drops)
      .values({ creatureId, itemId, chance, condition })
      .onConflictDoUpdate({
        target: [schema.drops.creatureId, schema.drops.itemId, schema.drops.condition],
        set: { chance },
      });
    n++;
  }
  console.log(`  drops: ${n}`);
}

async function seedChangelog(db: Database, ws: XLSX.WorkSheet): Promise<void> {
  let n = 0;
  for (const row of rowsOf(ws)) {
    const version = clean(row.Versao);
    if (!version) continue;
    const dateRaw = row.Data;
    const date =
      dateRaw instanceof Date
        ? dateRaw
        : dateRaw
          ? new Date(String(dateRaw).slice(0, 10))
          : new Date();
    await upsertByCode(db, schema.changelog, "version", version, {
      date,
      change: clean(row.Mudanca) ?? "",
      reason: clean(row.Motivo) ?? "",
      impact: clean(row.Impacto) ?? "",
    });
    n++;
  }
  console.log(`  changelog: ${n}`);
}
