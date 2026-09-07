CREATE TABLE IF NOT EXISTS "creature_spawn_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"spawn_weight" real DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creature_spawn_rules_creature_id_unique" UNIQUE("creature_id"),
	CONSTRAINT "creature_spawn_rules_weight_positive" CHECK ("creature_spawn_rules"."spawn_weight" > 0)
);
--> statement-breakpoint
ALTER TABLE "biomes" ADD COLUMN "spawn_chance" real DEFAULT 0.15 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creature_spawn_rules" ADD CONSTRAINT "creature_spawn_rules_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "biomes" ADD CONSTRAINT "biomes_spawn_chance_range" CHECK ("biomes"."spawn_chance" >= 0 AND "biomes"."spawn_chance" <= 1);