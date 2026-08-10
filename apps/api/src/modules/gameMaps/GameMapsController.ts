import type { RequestHandler } from "express";
import { gameMapsService } from "./GameMapsService";
import type {
  BatchCreateGameMapsBody,
  CreateGameMapBody,
  DeleteGameMapBody,
  UpdateGameMapBody,
} from "./GameMapsTypes";

export const gameMapsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await gameMapsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        era: q.era,
      }),
    );
  }) satisfies RequestHandler,
  getByCode: (async (req, res) => {
    res.json(await gameMapsService.getByCode(req.params.code!));
  }) satisfies RequestHandler,
  create: (async (req, res) => {
    res.status(201).json(await gameMapsService.create(req.body as CreateGameMapBody));
  }) satisfies RequestHandler,
  update: (async (req, res) => {
    res
      .status(200)
      .json(await gameMapsService.update(req.params.code!, req.body as UpdateGameMapBody));
  }) satisfies RequestHandler,
  batchCreate: (async (req, res) => {
    res.status(201).json(await gameMapsService.batchCreate(req.body as BatchCreateGameMapsBody));
  }) satisfies RequestHandler,
  delete: (async (req, res) => {
    res
      .status(200)
      .json(await gameMapsService.remove(req.params.code!, req.body as DeleteGameMapBody));
  }) satisfies RequestHandler,
};
