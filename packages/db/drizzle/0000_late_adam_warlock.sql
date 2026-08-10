CREATE TYPE "public"."awakening_type" AS ENUM('reinforcement', 'swap');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('defined', 'partial', 'pending');--> statement-breakpoint
CREATE TYPE "public"."era" AS ENUM('paleozoic', 'mesozoic', 'cenozoic');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "elemental_advantages" (
	"id" serial PRIMARY KEY NOT NULL,
	"attacker_element_id" integer NOT NULL,
	"defender_element_id" integer NOT NULL,
	"multiplier" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "elemental_advantages_attacker_element_id_defender_element_id_unique" UNIQUE("attacker_element_id","defender_element_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "elements" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "elements_code_unique" UNIQUE("code"),
	CONSTRAINT "elements_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creature_classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"biological_scope" text,
	"passive" text,
	"work_function" text,
	"fusion_rule" text,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creature_classes_code_unique" UNIQUE("code"),
	CONSTRAINT "creature_classes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "biomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"predominant_elements" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "biomes_code_unique" UNIQUE("code"),
	CONSTRAINT "biomes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_maps" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"era" "era" NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"biome_progression_raw" text,
	"status" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_maps_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "map_biomes" (
	"id" serial PRIMARY KEY NOT NULL,
	"map_id" integer NOT NULL,
	"biome_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "map_biomes_map_id_biome_id_unique" UNIQUE("map_id","biome_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "awakenings" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"creature_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" "awakening_type" NOT NULL,
	"activation_chance_pct" integer,
	"reference_species" text,
	"visual_changes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "awakenings_code_unique" UNIQUE("code"),
	CONSTRAINT "awakenings_creature_id_unique" UNIQUE("creature_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"original_name" text NOT NULL,
	"base_species" text,
	"class_id" integer NOT NULL,
	"element_id" integer NOT NULL,
	"map_id" integer,
	"biome_id" integer,
	"role" text,
	"silhouette_note" text,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creatures_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "abilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"element_id" integer,
	"type" text,
	"effect" text,
	"awakening_only" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abilities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drops" (
	"id" serial PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"chance" real NOT NULL,
	"condition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drops_creature_id_item_id_condition_unique" UNIQUE("creature_id","item_id","condition"),
	CONSTRAINT "drops_chance_range" CHECK ("drops"."chance" >= 0 AND "drops"."chance" <= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"effect" text,
	"acquisition" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "missions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"map_id" integer,
	"npc_id" integer,
	"requirement" text,
	"reward" text,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "npcs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"faction" text,
	"map_id" integer,
	"role" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "npcs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "changelog" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"date" date DEFAULT now() NOT NULL,
	"change" text NOT NULL,
	"reason" text NOT NULL,
	"impact" text NOT NULL,
	"entity" text,
	"entity_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "changelog_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "design_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "document_status" DEFAULT 'pending' NOT NULL,
	"body_markdown" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_documents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "elemental_advantages" ADD CONSTRAINT "elemental_advantages_attacker_element_id_elements_id_fk" FOREIGN KEY ("attacker_element_id") REFERENCES "public"."elements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "elemental_advantages" ADD CONSTRAINT "elemental_advantages_defender_element_id_elements_id_fk" FOREIGN KEY ("defender_element_id") REFERENCES "public"."elements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_biomes" ADD CONSTRAINT "map_biomes_map_id_game_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."game_maps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_biomes" ADD CONSTRAINT "map_biomes_biome_id_biomes_id_fk" FOREIGN KEY ("biome_id") REFERENCES "public"."biomes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "awakenings" ADD CONSTRAINT "awakenings_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creatures" ADD CONSTRAINT "creatures_class_id_creature_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."creature_classes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creatures" ADD CONSTRAINT "creatures_element_id_elements_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."elements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creatures" ADD CONSTRAINT "creatures_map_id_game_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."game_maps"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creatures" ADD CONSTRAINT "creatures_biome_id_biomes_id_fk" FOREIGN KEY ("biome_id") REFERENCES "public"."biomes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "abilities" ADD CONSTRAINT "abilities_element_id_elements_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."elements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drops" ADD CONSTRAINT "drops_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drops" ADD CONSTRAINT "drops_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "missions" ADD CONSTRAINT "missions_map_id_game_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."game_maps"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "missions" ADD CONSTRAINT "missions_npc_id_npcs_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "npcs" ADD CONSTRAINT "npcs_map_id_game_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."game_maps"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
