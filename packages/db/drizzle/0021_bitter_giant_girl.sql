CREATE TYPE "public"."equipment_effect" AS ENUM('buff_attack', 'buff_defense', 'debuff_attack', 'debuff_defense');--> statement-breakpoint
CREATE TYPE "public"."equipment_slot" AS ENUM('amplifier', 'enchanter');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"slot" "equipment_slot" NOT NULL,
	"effect" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipment_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_recipes_equipment_item" UNIQUE("equipment_id","item_id"),
	CONSTRAINT "equipment_recipes_quantity_range" CHECK ("equipment_recipes"."quantity" >= 1 AND "equipment_recipes"."quantity" <= 999)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipment_id" integer NOT NULL,
	"tier" integer NOT NULL,
	"effect_code" "equipment_effect" NOT NULL,
	"effect_value" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_stats_equipment_id_unique" UNIQUE("equipment_id"),
	CONSTRAINT "equipment_stats_tier_range" CHECK ("equipment_stats"."tier" >= 1 AND "equipment_stats"."tier" <= 9),
	CONSTRAINT "equipment_stats_effect_value_range" CHECK ("equipment_stats"."effect_value" >= 1 AND "equipment_stats"."effect_value" <= 100)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment_recipes" ADD CONSTRAINT "equipment_recipes_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment_recipes" ADD CONSTRAINT "equipment_recipes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment_stats" ADD CONSTRAINT "equipment_stats_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
