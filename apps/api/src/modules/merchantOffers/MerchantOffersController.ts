import type { RequestHandler } from "express";
import { merchantOffersService } from "./MerchantOffersService";
import type {
  BatchUpsertMerchantOffersBody,
  UpsertMerchantOfferBody,
} from "./MerchantOffersTypes";

export const merchantOffersController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await merchantOffersService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        npcCode: q.npcCode,
        itemCode: q.itemCode,
      }),
    );
  }) satisfies RequestHandler,
  upsert: (async (req, res) => {
    res.status(201).json(await merchantOffersService.upsert(req.body as UpsertMerchantOfferBody));
  }) satisfies RequestHandler,
  batchUpsert: (async (req, res) => {
    res
      .status(201)
      .json(await merchantOffersService.batchUpsert(req.body as BatchUpsertMerchantOffersBody));
  }) satisfies RequestHandler,
};
