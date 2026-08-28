import type { RequestHandler } from "express";
import { equipmentRecipesService } from "./EquipmentRecipesService";
import type {
  BatchUpsertEquipmentRecipesBody,
  DeleteEquipmentRecipeBody,
  UpsertEquipmentRecipeBody,
} from "./EquipmentRecipesTypes";

export const equipmentRecipesController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await equipmentRecipesService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        equipmentCode: q.equipmentCode,
        itemCode: q.itemCode,
      }),
    );
  }) satisfies RequestHandler,

  upsert: (async (req, res) => {
    res
      .status(201)
      .json(await equipmentRecipesService.upsert(req.body as UpsertEquipmentRecipeBody));
  }) satisfies RequestHandler,

  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(
        await equipmentRecipesService.batchUpsert(req.body as BatchUpsertEquipmentRecipesBody),
      );
  }) satisfies RequestHandler,

  delete: (async (req, res) => {
    res.status(200).json(await equipmentRecipesService.remove(req.body as DeleteEquipmentRecipeBody));
  }) satisfies RequestHandler,
};
