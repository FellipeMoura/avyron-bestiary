import { asc, count, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@bestiary/db";
import { registry } from "../../shared/openapi/registry";
import { OFFICIAL_TERM } from "../../shared/services/terminology";

interface RouteDefinition {
  type: string;
  route?: {
    method: string;
    path: string;
    tags?: string[];
    summary?: string;
  };
}

function collectEndpoints(): Map<string, string[]> {
  const byTag = new Map<string, string[]>();
  const defs = (registry.definitions as unknown as RouteDefinition[]) ?? [];
  for (const d of defs) {
    if (d.type !== "route" || !d.route) continue;
    const { method, path, tags, summary } = d.route;
    const tag = tags?.[0] ?? "other";
    const line = `${method.toUpperCase().padEnd(6)} ${path}${summary ? ` — ${summary}` : ""}`;
    const bucket = byTag.get(tag) ?? [];
    bucket.push(line);
    byTag.set(tag, bucket);
  }
  return byTag;
}

/**
 * Builds a compact markdown summary of the project state. Meant to be the
 * first read of any writing agent's session — cheaper than pulling four
 * separate lists.
 */
export async function buildContextMarkdown(): Promise<string> {
  const [classes, elements, creaturesByEra, recentChanges, docCounts] = await Promise.all([
    db
      .select({ code: schema.creatureClasses.code, name: schema.creatureClasses.name, status: schema.creatureClasses.status })
      .from(schema.creatureClasses)
      .orderBy(asc(schema.creatureClasses.code)),
    db
      .select({ code: schema.elements.code, name: schema.elements.name })
      .from(schema.elements)
      .orderBy(asc(schema.elements.code)),
    db
      .select({
        era: schema.gameMaps.era,
        creatureCount: count(schema.creatures.id),
      })
      .from(schema.gameMaps)
      .leftJoin(schema.creatures, eq(schema.creatures.mapId, schema.gameMaps.id))
      .groupBy(schema.gameMaps.era),
    db
      .select({
        version: schema.changelog.version,
        date: schema.changelog.date,
        change: schema.changelog.change,
        reason: schema.changelog.reason,
      })
      .from(schema.changelog)
      .orderBy(desc(schema.changelog.date), desc(schema.changelog.id))
      .limit(5),
    db.select({ n: sql<number>`COUNT(*)::int` }).from(schema.designDocuments),
  ]);

  const lines: string[] = [];
  lines.push("# Bestiary — current context");
  lines.push("");
  lines.push("_First read of every session. Token-cheap snapshot of the rules, reference codes, and endpoint index._");
  lines.push("");

  lines.push("## How to write");
  lines.push("- Auth: header `X-API-Key: <key>` on every POST/PATCH. Reads are open.");
  lines.push("- Every write body includes `reason` (3–500 chars) and `impact` (3–500 chars). Server writes the changelog and picks the version — never send a version.");
  lines.push("- Version format is `0.NN`, monotonic, server-assigned.");
  lines.push("- POST responds `{\"code\",\"version\"}`. PATCH responds `{\"code\",\"version\"}`. Batch responds `{\"codes\":[...],\"version\"}`. Never the full row.");
  lines.push("- Foreign keys go by CODE (e.g. `classCode: \"CLS-001\"`), never by numeric id. Unknown code → 422 with the valid options.");
  lines.push("- Junctions (`/drops`, `/map-biomes`, `/elemental-advantages`) POST is upsert. No PATCH/DELETE — re-POST to change values.");
  lines.push("- 409 on: duplicate `code`, or POST /awakenings when the creature already has one.");
  lines.push("- 422 on: schema validation, unknown `?fields`, forbidden terminology, unknown FK code. Error messages name the field and list valid values.");
  lines.push("");

  lines.push("## How to read");
  lines.push("- Every list supports `?fields=code,name` — use it. Full rows waste tokens.");
  lines.push("- Every list supports `?limit` (default 100, max 500) and `?offset`.");
  lines.push("- Common filters where applicable: `?era`, `?classCode`, `?elementCode`, `?mapCode`, `?biomeCode`.");
  lines.push("- Full field schemas and per-endpoint request/response shapes: `GET /openapi.json`.");
  lines.push("- Long-form design docs: `GET /documents/{slug}` with `Accept: text/markdown` returns plain text (no JSON envelope).");
  lines.push("");

  lines.push("## Code prefixes");
  lines.push("_Every resource has a stable string code. Prefixes are preserved from the Portuguese source material — they are values, not code._");
  lines.push("- `CRT-*` creature · `DSP-*` awakening (**D**esperta**r**) · `ELE-*` element · `CLS-*` creature class");
  lines.push("- `BIO-*` biome · `HAB-*` ability (**hab**ilidade) · `ITM-*` item · `NPC-*` npc · `MIS-*` mission · `DRP-*` drop · `RLC-*` relic (**relic**ário)");
  lines.push("- Maps use era-based codes: `PZ-01` (paleozoic), `MZ-01` (mesozoic), `CZ-01` (cenozoic).");
  lines.push("");

  lines.push("## Terminology");
  lines.push(`- Official term: **${OFFICIAL_TERM}** (temporary transformation, returns to base form).`);
  lines.push('- Deprecated (rejected with 422 on any write field): **"Evolução"**, **"Forma Ancestral"**, **"Formas Ancestrais"**.');
  lines.push("");

  lines.push("## Domain invariants");
  lines.push("- **The game is 3D**, Godot, locked isometric orthographic camera at 30° pitch / 45° yaw. Exploration is real-time; **combat is turn-based**, 1v1 with free switching, fought in-world. See documents `combate` and `camera-e-perspectiva`.");
  lines.push("- **The game is called Avyron.** Eras carry in-world names: Aetheris (paleozoic), Titanor (mesozoic), Novaterra (cenozoic). The database enum stays English — only labels changed. See document `nomenclatura`.");
  lines.push("- **Roster is closed at three lineages:** Loricati (CLS-001, arthropods), Theria (CLS-002, synapsids), Draconis (CLS-003, sauropsids). Creatures outside them are out of scope.");
  lines.push("- **Creature ↔ Awakening is 1:1.** `POST /awakenings` for a creature that already has one → 409.");
  lines.push("- **Classes have no CLS×CLS advantage matrix** (Changelog 0.01) — no damage/multiplier/stat fields on `creature_classes`, and no cycle like the elemental ring exists between classes. Refined by the Relicário system: an *equipment* (relic) can grant a class-linked bonus to capture chance, but that is a property of the equipment, not a class-vs-class matchup. The Relicário no longer grants a combat status buff (removed from the system's scope — see `relicario`). See documents `classes`, `captura`, `relicario`.");
  lines.push("- **Elements DO influence combat**, as a closed ring: Agua → Fogo → Natureza → Terra → Gelo → Eletricidade → Agua (arrow means \"beats\"). Advantage 2.0, disadvantage 0.5, everything else 1.0 by omission.");
  lines.push("- **Elements carry a visual palette the game consumes.** `paletteShadow`/`paletteMid`/`paletteHighlight` are one RAMP read by luminance (darkest texel of the creature body lands on shadow, brightest on highlight) — not three independent colours. `paletteAura` is the Despertar Ancestral glow and is a separate column on purpose: an aura in the body's own colour is invisible. `paletteSpread` (0–0.5) is how far one creature may drift inside the family. All colours are `#RRGGBB`, six digits. Prefer the `/elements` screen in the web UI — it previews the ramp against the real map backdrops, which a PATCH cannot.");
  lines.push("- **3 eras × 3 maps × ~20 unique creatures.** Reappearances on later maps do not count toward the cap.");
  lines.push("");

  lines.push("## Numbers layer");
  lines.push("_The catalog tables stay descriptive; everything the Godot build needs to run a battle lives here._");
  lines.push("- `combat-rules` — **singleton**, the tuning constants (damage scale, charge fill rates, capture bounds, level cap). `GET /combat-rules` and `PATCH /combat-rules`; no code, no list, no POST. This is where balance is tuned.");
  lines.push("- `progression-rules` — **singleton**, the level-up constants (XP curve, XP yield divisor, material cost per level). `GET` and `PATCH` only, same shape as `combat-rules`.");
  lines.push("_The four below use upsert semantics — re-POST to change a value, no PATCH._");
  lines.push("- `creature-stats` — 1:1 with a creature, addressed by creature code. Five base stats (`baseHp`, `baseAttack`, `baseDefense`, `baseSpeed`, `baseCharge`) plus `growthRate` and `xpYield`.");
  lines.push("  Effective value: `floor(base * (1 + growthRate * (level - 1)))`.");
  lines.push("- `ability-stats` — 1:1 with an ability. `power` 0 means a status move; `effectCode` is the switch the battle system runs on.");
  lines.push("- `capture-rules` — 1:1 with a creature. `catchRate` 1–255, higher is easier — still the source field, but as of the Relicário system (`relicario` document) the capture formula reads it inverted, `resistance = 256 - catchRate`. `awakenedMultiplier` is vestigial: the new formula has no Despertar term.");
  lines.push("- `creature-abilities` — junction, which creature knows which move and at what level.");
  lines.push("- Damage: `floor((power * attack / defense) * 0.4 * elementMultiplier * random(0.90, 1.10))`, minimum 1.");
  lines.push("- The Despertar meter fills on damage taken (×1.0) and dealt (×0.5), scaled by `baseCharge / 50`. Full at 100, lasts 3 turns. See document `carga-e-despertar`.");
  lines.push("");

  lines.push("## Level progression");
  lines.push("_Levelling up needs BOTH: enough XP **and** the class material spent. See document `progressao`._");
  lines.push("- `xpToNext(level) = floor(xpCurveBase * level ^ xpCurveExponent)`.");
  lines.push("- XP gained on a win: `floor(target.xpYield * targetLevel / xpYieldDivisor)`. `xpYield` is per species, on `creature-stats`.");
  lines.push("- Material cost: `itemCostBase + floor(level / itemCostLevelStep)` units of the **levelling creature's own class** item.");
  lines.push("- One material per class, `category: \"material\"`: ITM-019 Quitina Fossilizada (Loricati), ITM-020 Presa Fóssil (Theria), ITM-021 Escama Fóssil (Draconis).");
  lines.push("- They come from `drops` (creature × item, `condition: \"Derrota em combate\"`) — the class of the **defeated** creature decides which material falls, never the winner's. This is loot categorisation only; classes still do not influence combat.");
  lines.push("");

  lines.push("## Relicário capture system");
  lines.push("_Replaces the old consumable capture items (`ITM-013..015`, deprecated). See document `relicario`._");
  lines.push("- `relics` — catalog of relic **models** (`RLC-*`). `elementCode`/`classCode` are fixed for the model's whole lifetime.");
  lines.push("- `relic-stats` — 1:1 with a relic, addressed by relic code. `slotCapacity`, `baseCaptureRate`, `captureRatePerLevel`, `maxLevel`.");
  lines.push("- `relic-rules` — **singleton**, global tuning: capture floor/ceiling and the three bonus/penalty points, plus the relic level-up gate (XP curve + class material cost, same two-part shape as creature levelling). `GET`/`PATCH` only.");
  lines.push("- Capture formula (works in 0–100 percentage points end to end, no HP or Despertar term):");
  lines.push("  ```");
  lines.push("  relicRate = relic-stats.baseCaptureRate + (level - 1) * relic-stats.captureRatePerLevel");
  lines.push("  resistance = 256 - capture-rules.catchRate");
  lines.push("  base% = (relicRate / resistance) * 100");
  lines.push("  final% = clamp(base%");
  lines.push("             + sameElementBonusPct   (if relic.elementCode == creature.elementCode)");
  lines.push("             + sameClassBonusPct     (if relic.classCode == creature.classCode)");
  lines.push("             - elementDisadvantagePenaltyPct  (if relic's element is at a disadvantage vs the creature's, per /elemental-advantages)");
  lines.push("           , captureFloorPct, captureCeilPct)");
  lines.push("  ```");
  lines.push("- A capture attempt still consumes the turn (existing combat rule, not part of this system).");
  lines.push("- No consumable is spent — what limits the player is `relic-stats.slotCapacity` and general storage, both enforced by the game, not this catalog.");
  lines.push("");

  lines.push("## Mining system");
  lines.push("_Tamed creatures mine automatically. Ore type is determined by class × biome affinity._");
  lines.push("- `items` — mineral SKUs (ITM-001 Pedra … ITM-012 Cristal Elemental Gelo). `category: \"mineral\"`.");
  lines.push("- `mining-rates` — junction: (classCode|biomeCode) + itemCode → weight [0,1]. Upsert, no PATCH/DELETE.");
  lines.push("- Final ore chance: `normalize(class_weight[ore] × biome_weight[ore])`. See document `mineracao`.");
  lines.push("- `creature_classes.workFunction` — JSON `{speedModifier, preferredOres, role}` per class.");
  lines.push("");

  lines.push("## Elements");
  for (const e of elements) lines.push(`- ${e.code} — ${e.name}`);
  lines.push("");

  lines.push("## Creature classes");
  lines.push("_(Classes do NOT influence combat — Changelog 0.01)_");
  for (const c of classes) {
    const status = c.status ? ` [${c.status}]` : "";
    lines.push(`- ${c.code} — ${c.name}${status}`);
  }
  lines.push("");

  lines.push("## Creatures per era");
  const eraOrder = ["paleozoic", "mesozoic", "cenozoic"] as const;
  const eraCounts = new Map(creaturesByEra.map((r) => [r.era, r.creatureCount]));
  for (const era of eraOrder) lines.push(`- ${era}: ${eraCounts.get(era) ?? 0}`);
  lines.push("");

  lines.push("## Documents");
  lines.push(`- Total: ${docCounts[0]?.n ?? 0}`);
  lines.push("");

  lines.push("## Example — create a creature");
  lines.push("```http");
  lines.push("POST /api/v1/creatures");
  lines.push("X-API-Key: <key>");
  lines.push("Content-Type: application/json");
  lines.push("");
  lines.push(JSON.stringify({
    code: "CRT-042",
    originalName: "Trilobita Sombrio",
    classCode: "CLS-001",
    elementCode: "ELE-002",
    mapCode: "PZ-01",
    biomeCode: "BIO-001",
    reason: "Preencher lacuna de nível 3 no PZ-01",
    impact: "Habilita missão MIS-014 e drop DRP-021",
  }, null, 2));
  lines.push("");
  lines.push('→ 201 {"code":"CRT-042","version":"0.42"}');
  lines.push("```");
  lines.push("");

  lines.push("## Endpoints");
  lines.push("_All paths are relative to `/api/v1`. Full request/response schemas at `GET /openapi.json`._");
  const byTag = collectEndpoints();
  const tagOrder = [
    "meta",
    "elements",
    "elemental-advantages",
    "creature-classes",
    "creatures",
    "awakenings",
    "maps",
    "biomes",
    "map-biomes",
    "abilities",
    "combat-rules",
    "progression-rules",
    "creature-stats",
    "ability-stats",
    "capture-rules",
    "creature-abilities",
    "items",
    "relics",
    "relic-stats",
    "relic-rules",
    "mining-rates",
    "npcs",
    "missions",
    "drops",
    "documents",
    "changelog",
  ];
  const seen = new Set<string>();
  const emitTag = (tag: string) => {
    const bucket = byTag.get(tag);
    if (!bucket || bucket.length === 0) return;
    lines.push("");
    lines.push(`### ${tag}`);
    for (const l of bucket) lines.push(`- \`${l}\``);
    seen.add(tag);
  };
  for (const tag of tagOrder) emitTag(tag);
  for (const tag of byTag.keys()) if (!seen.has(tag)) emitTag(tag);
  lines.push("");

  lines.push("## Last 5 changelog entries");
  for (const c of recentChanges) {
    const dateStr = c.date instanceof Date ? c.date.toISOString().slice(0, 10) : String(c.date);
    lines.push(`- **${c.version}** (${dateStr}) — ${c.change}. _${c.reason}_`);
  }

  return lines.join("\n");
}
