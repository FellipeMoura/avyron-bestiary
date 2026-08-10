CREATE TABLE IF NOT EXISTS "mining_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer,
	"biome_id" integer,
	"item_id" integer NOT NULL,
	"weight" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mining_rates_class_item_unique" UNIQUE("class_id","item_id"),
	CONSTRAINT "mining_rates_biome_item_unique" UNIQUE("biome_id","item_id"),
	CONSTRAINT "mining_rates_subject_check" CHECK (("mining_rates"."class_id" IS NULL) != ("mining_rates"."biome_id" IS NULL)),
	CONSTRAINT "mining_rates_weight_range" CHECK ("mining_rates"."weight" >= 0 AND "mining_rates"."weight" <= 1)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mining_rates" ADD CONSTRAINT "mining_rates_class_id_creature_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."creature_classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mining_rates" ADD CONSTRAINT "mining_rates_biome_id_biomes_id_fk" FOREIGN KEY ("biome_id") REFERENCES "public"."biomes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mining_rates" ADD CONSTRAINT "mining_rates_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
