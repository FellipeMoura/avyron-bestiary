import type { RefinementCtx } from "zod";
import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const BIOME_REGION_SHAPES = ["band", "circle", "rect"] as const;
export type BiomeRegionShape = (typeof BIOME_REGION_SHAPES)[number];

/**
 * Every coordinate is normalized to the unit square — never meters. See the
 * `map_biome_regions` comment in the schema for why: in meters, resizing a
 * map silently moves every region onto the wrong ground.
 */
const coord = z.number().min(-1).max(1);

const bandParams = z.object({
  axis: z.enum(["x", "z"]),
  from: coord,
  to: coord,
});
const circleParams = z.object({
  cx: coord,
  cz: coord,
  /** May exceed 1: a circle centered in the map can cover past its corners. */
  r: z.number().gt(0).max(3),
});
const rectParams = z.object({ x0: coord, z0: coord, x1: coord, z1: coord });

const PARAMS_BY_SHAPE = {
  band: bandParams,
  circle: circleParams,
  rect: rectParams,
} as const;

/**
 * Validate `params` against `shape`.
 *
 * A CHECK constraint cannot say "these keys iff that enum value", so the
 * pairing is enforced here — and `.strict()` matters as much as the shape
 * itself: without it, `{cx, cz, r}` sent with `shape: "band"` would pass as
 * an object with three unknown keys and no `axis`, and the region would
 * resolve to nothing at runtime instead of failing at write time.
 */
function checkParams(shape: BiomeRegionShape, params: unknown, ctx: RefinementCtx): void {
  const parsed = PARAMS_BY_SHAPE[shape].strict().safeParse(params);
  if (!parsed.success) {
    const expected = Object.keys(PARAMS_BY_SHAPE[shape].shape).join(", ");
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["params"],
      message: `params for shape '${shape}' must have exactly: ${expected} (${parsed.error.issues
        .map((i) => `${i.path.join(".") || "params"}: ${i.message}`)
        .join("; ")})`,
    });
    return;
  }
  const value = parsed.data;
  if (shape === "band" && "from" in value && value.from >= value.to) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["params", "from"],
      message: "band params: 'from' must be less than 'to'",
    });
  }
  if (shape === "rect" && "x0" in value && (value.x0 >= value.x1 || value.z0 >= value.z1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["params"],
      message: "rect params: 'x0' must be less than 'x1' and 'z0' less than 'z1'",
    });
  }
}

export const MapBiomeRegionSchema = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: "RGN-001" }),
    mapId: z.number().int(),
    biomeId: z.number().int(),
    shape: z.enum(BIOME_REGION_SHAPES),
    params: z.union([bandParams, circleParams, rectParams]),
    sortOrder: z.number().int(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("MapBiomeRegion");

export const MAP_BIOME_REGION_FIELDS = [
  "id", "code", "mapId", "biomeId", "shape", "params", "sortOrder", "notes",
  "createdAt", "updatedAt",
] as const;

export const ListMapBiomeRegionsQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  mapCode: z.string().optional(),
  biomeCode: z.string().optional(),
});
export const CodeParamsSchema = z.object({ code: z.string().openapi({ example: "RGN-001" }) });

const coreShape = {
  /**
   * Explicit, not generated — same as creatures and every other resource
   * whose service resolves foreign keys by hand.
   */
  code: z.string().min(3).max(16),
  mapCode: z.string().openapi({ example: "PZ-01" }),
  biomeCode: z.string().openapi({ example: "BIO-002" }),
  shape: z.enum(BIOME_REGION_SHAPES),
  params: z.union([bandParams, circleParams, rectParams]),
  /** Evaluation order inside the map — first region that matches wins. */
  sortOrder: z.number().int().min(0).default(0),
  notes: z.string().max(2000).nullish(),
};

const coreSchema = z.object(coreShape).superRefine((v, ctx) => {
  checkParams(v.shape, v.params, ctx);
});

export const CreateMapBiomeRegionBodySchema = z
  .object({ ...coreShape, ...changeMetadataSchema.shape })
  .superRefine((v, ctx) => checkParams(v.shape, v.params, ctx))
  .openapi("CreateMapBiomeRegionBody");

/**
 * `shape` and `params` travel together on PATCH. Sending one without the
 * other would leave the row describing a shape its params do not fit, and
 * nothing downstream would notice — the region would just stop matching.
 */
export const UpdateMapBiomeRegionBodySchema = z
  .object(coreShape)
  .partial()
  .extend(changeMetadataSchema.shape)
  .superRefine((v, ctx) => {
    const hasShape = v.shape !== undefined;
    const hasParams = v.params !== undefined;
    if (hasShape !== hasParams) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasShape ? "params" : "shape"],
        message: "shape and params must be sent together",
      });
      return;
    }
    if (hasShape && hasParams) checkParams(v.shape!, v.params, ctx);
  })
  .openapi("UpdateMapBiomeRegionBody");

export const BatchCreateMapBiomeRegionsBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(100),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchCreateMapBiomeRegionsBody");

export const CreatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("CreatedMapBiomeRegionResponse");
export const UpdatedResponseSchema = z.object({ code: z.string(), version: z.string() }).openapi("UpdatedMapBiomeRegionResponse");
export const BatchCreatedResponseSchema = z.object({ codes: z.array(z.string()), version: z.string() }).openapi("BatchCreatedMapBiomeRegionsResponse");
export const DeleteMapBiomeRegionBodySchema = changeMetadataSchema.openapi("DeleteMapBiomeRegionBody");

export type CreateMapBiomeRegionBody = z.infer<typeof CreateMapBiomeRegionBodySchema>;
export type UpdateMapBiomeRegionBody = z.infer<typeof UpdateMapBiomeRegionBodySchema>;
export type BatchCreateMapBiomeRegionsBody = z.infer<typeof BatchCreateMapBiomeRegionsBodySchema>;
export type DeleteMapBiomeRegionBody = z.infer<typeof DeleteMapBiomeRegionBodySchema>;
