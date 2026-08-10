import type { RequestHandler } from "express";
import { designDocumentsService } from "./DesignDocumentsService";
import type {
  CreateDesignDocumentBody,
  UpdateDesignDocumentBody,
} from "./DesignDocumentsTypes";

export const designDocumentsController = {
  list: (async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query as any;
    res.json(
      await designDocumentsService.list({
        limit: q.limit,
        offset: q.offset,
        fields: q.fields,
        status: q.status,
      }),
    );
  }) satisfies RequestHandler,

  /**
   * Content negotiation: `Accept: text/markdown` returns the raw markdown body;
   * everything else returns the full JSON envelope with metadata.
   */
  getBySlug: (async (req, res) => {
    const row = await designDocumentsService.getBySlug(req.params.slug!);
    const accept = req.header("accept") ?? "";
    if (accept.includes("text/markdown")) {
      res.type("text/markdown; charset=utf-8").send(row.bodyMarkdown);
      return;
    }
    res.json(row);
  }) satisfies RequestHandler,

  create: (async (req, res) => {
    res
      .status(201)
      .json(await designDocumentsService.create(req.body as CreateDesignDocumentBody));
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    res
      .status(200)
      .json(
        await designDocumentsService.update(req.params.slug!, req.body as UpdateDesignDocumentBody),
      );
  }) satisfies RequestHandler,
};
