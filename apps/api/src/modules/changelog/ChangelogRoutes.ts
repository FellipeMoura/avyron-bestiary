import { Router } from "express";
import { z } from "../../shared/openapi/zod";
import { validateParams, validateQuery } from "../../shared/middleware/validate";
import { registry } from "../../shared/openapi/registry";
import { changelogController } from "./ChangelogController";
import {
  ChangelogEntrySchema,
  ListChangelogQuerySchema,
  VersionParamsSchema,
} from "./ChangelogTypes";

export const changelogRouter = Router();
const TAG = "changelog";

registry.registerPath({
  method: "get",
  path: "/changelog",
  tags: [TAG],
  summary: "List changelog entries (newest first)",
  request: { query: ListChangelogQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(ChangelogEntrySchema) } },
      description: "OK",
    },
  },
});
changelogRouter.get("/", validateQuery(ListChangelogQuerySchema), changelogController.list);

registry.registerPath({
  method: "get",
  path: "/changelog/{version}",
  tags: [TAG],
  summary: "Get one changelog entry by version (e.g. '0.11')",
  request: { params: VersionParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ChangelogEntrySchema } },
      description: "The entry",
    },
    404: { description: "Version not found" },
  },
});
changelogRouter.get(
  "/:version",
  validateParams(VersionParamsSchema),
  changelogController.getByVersion,
);
