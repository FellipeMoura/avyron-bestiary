import type { RequestHandler } from "express";
import { changelogService } from "./ChangelogService";

export const changelogController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await changelogService.list({
        limit: q.limit,
        offset: q.offset,
        entity: q.entity,
        entityId: q.entityId,
      }),
    );
  }) satisfies RequestHandler,
  getByVersion: (async (req, res) => {
    res.json(await changelogService.getByVersion(req.params.version!));
  }) satisfies RequestHandler,
};
