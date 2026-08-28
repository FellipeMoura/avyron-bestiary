import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { requireApiKey } from "../../shared/middleware/apiKey";
import { writeLimiter } from "../../shared/middleware/rateLimit";
import { validateBody, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { rejectForbiddenTerms } from "../../shared/services/terminology";
import { equipmentRecipesController } from "./EquipmentRecipesController";
import {
  BatchUpsertEquipmentRecipesBodySchema,
  BatchUpsertResponseSchema,
  DeleteEquipmentRecipeBodySchema,
  DeletedResponseSchema,
  EquipmentRecipeSchema,
  ListEquipmentRecipesQuerySchema,
  UpsertEquipmentRecipeBodySchema,
  UpsertResponseSchema,
} from "./EquipmentRecipesTypes";

/**
 * Seventh hand-written junction module. `AUDITORIA.md` item 5(c) named the
 * seventh as the trigger to revisit `junctionFactory` — this is it, and the
 * decision recorded there still holds for now: the four simple-pair junctions
 * are the factory's candidate set, and this one joins them.
 */
export const equipmentRecipesRouter = Router();
const TAG = "equipment-recipes";

registry.registerPath({
  method: "get",
  path: "/equipment-recipes",
  tags: [TAG],
  summary: "List equipment recipe lines (filter by equipment and/or item)",
  request: { query: ListEquipmentRecipesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(EquipmentRecipeSchema) } },
      description: "OK",
    },
  },
});
equipmentRecipesRouter.get(
  "/",
  validateQuery(ListEquipmentRecipesQuerySchema),
  equipmentRecipesController.list,
);

registry.registerPath({
  method: "post",
  path: "/equipment-recipes/batch",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Batch upsert recipe lines",
  request: {
    body: {
      content: { "application/json": { schema: BatchUpsertEquipmentRecipesBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: BatchUpsertResponseSchema } },
      description: "Upserted",
    },
  },
});
equipmentRecipesRouter.post(
  "/batch",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(BatchUpsertEquipmentRecipesBodySchema),
  equipmentRecipesController.batchUpsert,
);

registry.registerPath({
  method: "post",
  path: "/equipment-recipes",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Upsert one recipe line (natural key: equipment + item)",
  request: {
    body: {
      content: { "application/json": { schema: UpsertEquipmentRecipeBodySchema } },
      required: true,
    },
  },
  responses: {
    201: { content: { "application/json": { schema: UpsertResponseSchema } }, description: "Upserted" },
  },
});
equipmentRecipesRouter.post(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(UpsertEquipmentRecipeBodySchema),
  equipmentRecipesController.upsert,
);

registry.registerPath({
  method: "delete",
  path: "/equipment-recipes",
  tags: [TAG],
  security: [{ ApiKey: [] }],
  summary: "Remove one ingredient from a recipe (natural key: equipment + item)",
  description:
    "The only thing upsert cannot express. `quantity: 0` is not an alternative — the check "
    + "constraint rejects it, so no row can claim to be an ingredient of zero units.",
  request: {
    body: {
      content: { "application/json": { schema: DeleteEquipmentRecipeBodySchema } },
      required: true,
    },
  },
  responses: {
    200: { content: { "application/json": { schema: DeletedResponseSchema } }, description: "Deleted" },
    404: { description: "This recipe does not use this item" },
  },
});
equipmentRecipesRouter.delete(
  "/",
  writeLimiter,
  requireApiKey,
  rejectForbiddenTerms,
  validateBody(DeleteEquipmentRecipeBodySchema),
  equipmentRecipesController.delete,
);
