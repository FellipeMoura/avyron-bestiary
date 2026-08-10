// Side-effect import: monkey-patches Express 4 to forward async handler
// rejections to `next(err)`. Without it, throws in async controllers hang
// the request until the client times out.
import "express-async-errors";
import cors from "cors";
import express from "express";
import { env, isProd } from "./env.js";
import { handleError } from "./shared/middleware/handleError.js";
import { buildOpenApiDocument } from "./shared/openapi/registry.js";
import { checkHealth } from "./shared/services/health.js";
import { abilitiesRouter } from "./modules/abilities/AbilitiesRoutes.js";
import { abilityStatsRouter } from "./modules/abilityStats/AbilityStatsRoutes.js";
import { awakeningsRouter } from "./modules/awakenings/AwakeningsRoutes.js";
import { biomesRouter } from "./modules/biomes/BiomesRoutes.js";
import { captureRulesRouter } from "./modules/captureRules/CaptureRulesRoutes.js";
import { changelogRouter } from "./modules/changelog/ChangelogRoutes.js";
import { combatRulesRouter } from "./modules/combatRules/CombatRulesRoutes.js";
import { contextRouter } from "./modules/context/ContextRoutes.js";
import { creatureAbilitiesRouter } from "./modules/creatureAbilities/CreatureAbilitiesRoutes.js";
import { creatureClassesRouter } from "./modules/creatureClasses/CreatureClassesRoutes.js";
import { creatureStatsRouter } from "./modules/creatureStats/CreatureStatsRoutes.js";
import { creaturesRouter } from "./modules/creatures/CreaturesRoutes.js";
import { designDocumentsRouter } from "./modules/designDocuments/DesignDocumentsRoutes.js";
import { dropsRouter } from "./modules/drops/DropsRoutes.js";
import { elementalAdvantagesRouter } from "./modules/elementalAdvantages/ElementalAdvantagesRoutes.js";
import { economyRulesRouter } from "./modules/economyRules/EconomyRulesRoutes.js";
import { elementsRouter } from "./modules/elements/ElementsRoutes.js";
import { gameMapsRouter } from "./modules/gameMaps/GameMapsRoutes.js";
import { itemStatsRouter } from "./modules/itemStats/ItemStatsRoutes.js";
import { itemsRouter } from "./modules/items/ItemsRoutes.js";
import { mapBiomesRouter } from "./modules/mapBiomes/MapBiomesRoutes.js";
import { merchantOffersRouter } from "./modules/merchantOffers/MerchantOffersRoutes.js";
import { miningRatesRouter } from "./modules/miningRates/MiningRatesRoutes.js";
import { missionsRouter } from "./modules/missions/MissionsRoutes.js";
import { npcsRouter } from "./modules/npcs/NpcsRoutes.js";
import { progressionRulesRouter } from "./modules/progressionRules/ProgressionRulesRoutes.js";
import { relicsRouter } from "./modules/relics/RelicsRoutes.js";
import { relicStatsRouter } from "./modules/relicStats/RelicStatsRoutes.js";
import { relicRulesRouter } from "./modules/relicRules/RelicRulesRoutes.js";

/**
 * Resolve the CORS origin at boot. In dev, an empty CORS_ORIGIN means
 * "allow anything" (convenient for tsx/vite). In prod, an empty
 * CORS_ORIGIN blocks all cross-origin traffic — deliberate: forgetting to
 * set the env should fail closed, not open.
 */
function resolveCorsOrigin(): boolean | string[] {
  if (env.corsOrigin) {
    return env.corsOrigin.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return isProd ? false : true;
}

export function createApp() {
  const app = express();
  app.disable("etag");
  // Trust the first proxy so express-rate-limit sees the real client IP
  // (Nginx sets X-Forwarded-For in front of us in prod).
  if (isProd) app.set("trust proxy", 1);
  app.use(cors({ origin: resolveCorsOrigin(), credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  // Liveness + DB probe. Public, no auth — deploy.sh polls this after reload.
  app.get("/health", async (_req, res) => {
    const h = await checkHealth();
    res.status(h.ok ? 200 : 503).json(h);
  });

  app.get("/", (_req, res) => {
    res.json({ app: "bestiary", docs: "/openapi.json", api: "/api/v1" });
  });

  // OpenAPI is generated dynamically from the registry — every module that
  // calls `registry.registerPath(...)` shows up automatically.
  app.get("/openapi.json", (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  const v1 = express.Router();
  v1.use("/context", contextRouter);
  v1.use("/elements", elementsRouter);
  v1.use("/elemental-advantages", elementalAdvantagesRouter);
  v1.use("/creature-classes", creatureClassesRouter);
  v1.use("/creatures", creaturesRouter);
  v1.use("/awakenings", awakeningsRouter);
  v1.use("/maps", gameMapsRouter);
  v1.use("/biomes", biomesRouter);
  v1.use("/map-biomes", mapBiomesRouter);
  v1.use("/abilities", abilitiesRouter);
  // Numbers layer — everything the Godot build needs to run a battle.
  v1.use("/combat-rules", combatRulesRouter);
  v1.use("/progression-rules", progressionRulesRouter);
  v1.use("/creature-stats", creatureStatsRouter);
  v1.use("/ability-stats", abilityStatsRouter);
  v1.use("/capture-rules", captureRulesRouter);
  v1.use("/creature-abilities", creatureAbilitiesRouter);
  v1.use("/items", itemsRouter);
  v1.use("/item-stats", itemStatsRouter);
  v1.use("/economy-rules", economyRulesRouter);
  // Relicário — equipment-based capture, replaces the old consumable items.
  v1.use("/relics", relicsRouter);
  v1.use("/relic-stats", relicStatsRouter);
  v1.use("/relic-rules", relicRulesRouter);
  v1.use("/npcs", npcsRouter);
  v1.use("/merchant-offers", merchantOffersRouter);
  v1.use("/missions", missionsRouter);
  v1.use("/drops", dropsRouter);
  v1.use("/mining-rates", miningRatesRouter);
  v1.use("/documents", designDocumentsRouter);
  v1.use("/changelog", changelogRouter);
  app.use("/api/v1", v1);

  // Catch-all 404 in JSON — Express's default is HTML, which is opaque to the
  // LLM consumers. Naming the method + path also hints at typos ("DELETE
  // /api/v1/creature-classes/CLS-004" tells the agent the route doesn't exist
  // instead of a bare page saying "Cannot DELETE ...").
  app.use((req, res) => {
    res.status(404).json({ message: `${req.method} ${req.originalUrl} not found` });
  });

  app.use(handleError);
  return app;
}
