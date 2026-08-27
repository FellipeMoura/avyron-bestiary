import { z } from "../../shared/openapi/zod";
import { changeMetadataSchema, paginationSchema } from "../../shared/services/query";

export const NpcAppearanceSchema = z
  .object({
    id: z.number().int(),
    npcId: z.number().int(),
    gender: z.enum(["male", "female"]),
    hair: z.string().nullable(),
    eyebrows: z.string().nullable(),
    beard: z.string().nullable(),
    outfitBody: z.string(),
    outfitArms: z.string(),
    outfitLegs: z.string(),
    outfitFeet: z.string(),
    outfitHead: z.string().nullable(),
    outfitAccessory: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("NpcAppearance");

export const NPC_APPEARANCE_FIELDS = [
  "id", "npcId", "gender", "hair", "eyebrows", "beard",
  "outfitBody", "outfitArms", "outfitLegs", "outfitFeet",
  "outfitHead", "outfitAccessory", "notes", "createdAt", "updatedAt",
] as const;

/** Columns an agent may set. Excludes id / npcId / timestamps. */
export const NPC_APPEARANCE_PAYLOAD = [
  "gender", "hair", "eyebrows", "beard",
  "outfitBody", "outfitArms", "outfitLegs", "outfitFeet",
  "outfitHead", "outfitAccessory", "notes",
] as const;

export const ListNpcAppearancesQuerySchema = paginationSchema.extend({
  fields: z.string().optional(),
  npcCode: z.string().optional(),
});

export const NpcCodeParamsSchema = z.object({
  code: z.string().openapi({ example: "NPC-001" }),
});

/**
 * Part values are NAMES from the character kit manifest
 * (apps/web/public/models/characters/manifest.json), not URLs. The API cannot
 * see the manifest, so it validates shape only; `pnpm game:export` fails on a
 * name the manifest doesn't list — same policy as a broken modelUrl.
 */
const coreSchema = z.object({
  npcCode: z.string().openapi({ example: "NPC-001" }),
  gender: z.enum(["male", "female"]).openapi({
    description:
      "As peças de outfit são malhas por gênero (Male_*/Female_*); os prefixos das peças devem bater com este campo.",
    example: "male",
  }),
  hair: z.string().max(80).nullish().openapi({
    description: "Nome no manifest, slot hair. Nulo = careca.",
    example: "Hair_SimpleParted",
  }),
  eyebrows: z.string().max(80).nullish().openapi({ example: "Eyebrows_Regular" }),
  beard: z.string().max(80).nullish().openapi({ example: "Hair_Beard" }),
  outfitBody: z.string().max(80).openapi({ example: "Male_Peasant_Body" }),
  outfitArms: z.string().max(80).openapi({ example: "Male_Peasant_Arms" }),
  outfitLegs: z.string().max(80).openapi({ example: "Male_Peasant_Legs" }),
  outfitFeet: z.string().max(80).openapi({ example: "Male_Peasant_Feet" }),
  outfitHead: z.string().max(80).nullish().openapi({
    description: "Capuz/chapéu. Nulo = cabeça descoberta.",
    example: "Male_Ranger_Head_Hood",
  }),
  outfitAccessory: z.string().max(80).nullish().openapi({ example: "Male_Ranger_Acc_Pauldron" }),
  notes: z.string().max(500).nullish(),
});

export const UpsertNpcAppearanceBodySchema = coreSchema
  .merge(changeMetadataSchema)
  .openapi("UpsertNpcAppearanceBody");

export const BatchUpsertNpcAppearancesBodySchema = z
  .object({
    items: z.array(coreSchema).min(1).max(200),
    reason: changeMetadataSchema.shape.reason,
    impact: changeMetadataSchema.shape.impact,
  })
  .openapi("BatchUpsertNpcAppearancesBody");

export const UpsertResponseSchema = z
  .object({ code: z.string(), version: z.string() })
  .openapi("UpsertNpcAppearanceResponse");
export const BatchUpsertResponseSchema = z
  .object({ codes: z.array(z.string()), version: z.string() })
  .openapi("BatchUpsertNpcAppearancesResponse");

export type UpsertNpcAppearanceBody = z.infer<typeof UpsertNpcAppearanceBodySchema>;
export type BatchUpsertNpcAppearancesBody = z.infer<typeof BatchUpsertNpcAppearancesBodySchema>;
