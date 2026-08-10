import { Router } from "express";
import type { RequestHandler } from "express";
import { registry } from "../../shared/openapi/registry";
import { buildContextMarkdown } from "./ContextService";

export const contextRouter = Router();

const handler: RequestHandler = async (_req, res) => {
  const md = await buildContextMarkdown();
  res.type("text/markdown; charset=utf-8").send(md);
};

registry.registerPath({
  method: "get",
  path: "/context",
  tags: ["meta"],
  summary: "Compact project snapshot in markdown",
  description:
    "First read of an agent's session. Returns a token-cheap markdown briefing: write/read rules, terminology, domain invariants, reference codes (elements + classes), creature counts per era, a canonical POST example, the full endpoint index (auto-derived from the registry), and the five most recent changelog entries. Always `text/markdown`.",
  responses: {
    200: {
      description: "Markdown snapshot",
      content: { "text/markdown": { schema: { type: "string" } } },
    },
  },
});
contextRouter.get("/", handler);
