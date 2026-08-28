CREATE TYPE "public"."biome_region_shape" AS ENUM('band', 'circle', 'rect');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "glyphs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "glyphs_code_unique" UNIQUE("code"),
	CONSTRAINT "glyphs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "map_biome_regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"map_id" integer NOT NULL,
	"biome_id" integer NOT NULL,
	"shape" "biome_region_shape" NOT NULL,
	"params" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_biome_regions_code_unique" UNIQUE("code"),
	CONSTRAINT "map_biome_regions_map_biome_order_unique" UNIQUE("map_id","biome_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "map_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_map_id" integer NOT NULL,
	"to_map_id" integer NOT NULL,
	"required_glyph_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_connections_from_to_unique" UNIQUE("from_map_id","to_map_id"),
	CONSTRAINT "map_connections_no_self_loop" CHECK ("map_connections"."from_map_id" <> "map_connections"."to_map_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "npc_duelists" (
	"id" serial PRIMARY KEY NOT NULL,
	"npc_id" integer NOT NULL,
	"opponent_creature_id" integer NOT NULL,
	"opponent_level" integer NOT NULL,
	"grants_glyph_id" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "npc_duelists_npc_id_unique" UNIQUE("npc_id"),
	CONSTRAINT "npc_duelists_grants_glyph_id_unique" UNIQUE("grants_glyph_id"),
	CONSTRAINT "npc_duelists_level_range" CHECK ("npc_duelists"."opponent_level" >= 1)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_biome_regions" ADD CONSTRAINT "map_biome_regions_map_id_game_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."game_maps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_biome_regions" ADD CONSTRAINT "map_biome_regions_biome_id_biomes_id_fk" FOREIGN KEY ("biome_id") REFERENCES "public"."biomes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_connections" ADD CONSTRAINT "map_connections_from_map_id_game_maps_id_fk" FOREIGN KEY ("from_map_id") REFERENCES "public"."game_maps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_connections" ADD CONSTRAINT "map_connections_to_map_id_game_maps_id_fk" FOREIGN KEY ("to_map_id") REFERENCES "public"."game_maps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_connections" ADD CONSTRAINT "map_connections_required_glyph_id_glyphs_id_fk" FOREIGN KEY ("required_glyph_id") REFERENCES "public"."glyphs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "npc_duelists" ADD CONSTRAINT "npc_duelists_npc_id_npcs_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "npc_duelists" ADD CONSTRAINT "npc_duelists_opponent_creature_id_creatures_id_fk" FOREIGN KEY ("opponent_creature_id") REFERENCES "public"."creatures"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "npc_duelists" ADD CONSTRAINT "npc_duelists_grants_glyph_id_glyphs_id_fk" FOREIGN KEY ("grants_glyph_id") REFERENCES "public"."glyphs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
