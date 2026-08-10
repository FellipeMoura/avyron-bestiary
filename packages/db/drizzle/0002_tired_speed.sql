CREATE TYPE "public"."ability_effect" AS ENUM('damage', 'buff_attack', 'buff_defense', 'debuff_attack', 'debuff_defense', 'heal', 'charge_gain');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ability_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"ability_id" integer NOT NULL,
	"power" integer DEFAULT 0 NOT NULL,
	"accuracy" integer DEFAULT 100 NOT NULL,
	"uses" integer DEFAULT 15 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"effect_code" "ability_effect" DEFAULT 'damage' NOT NULL,
	"effect_value" integer DEFAULT 0 NOT NULL,
	"target_self" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ability_stats_ability_id_unique" UNIQUE("ability_id"),
	CONSTRAINT "ability_stats_power_range" CHECK ("ability_stats"."power" >= 0 AND "ability_stats"."power" <= 250),
	CONSTRAINT "ability_stats_accuracy_range" CHECK ("ability_stats"."accuracy" >= 1 AND "ability_stats"."accuracy" <= 100),
	CONSTRAINT "ability_stats_uses_range" CHECK ("ability_stats"."uses" >= 1 AND "ability_stats"."uses" <= 40),
	CONSTRAINT "ability_stats_priority_range" CHECK ("ability_stats"."priority" >= -3 AND "ability_stats"."priority" <= 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capture_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"catch_rate" integer NOT NULL,
	"awakened_multiplier" real DEFAULT 0.5 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_rules_creature_id_unique" UNIQUE("creature_id"),
	CONSTRAINT "capture_rules_catch_range" CHECK ("capture_rules"."catch_rate" >= 1 AND "capture_rules"."catch_rate" <= 255),
	CONSTRAINT "capture_rules_awakened_range" CHECK ("capture_rules"."awakened_multiplier" > 0 AND "capture_rules"."awakened_multiplier" <= 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creature_abilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"ability_id" integer NOT NULL,
	"learn_level" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creature_abilities_creature_id_ability_id_unique" UNIQUE("creature_id","ability_id"),
	CONSTRAINT "creature_abilities_level_range" CHECK ("creature_abilities"."learn_level" >= 1 AND "creature_abilities"."learn_level" <= 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creature_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"creature_id" integer NOT NULL,
	"base_hp" integer NOT NULL,
	"base_attack" integer NOT NULL,
	"base_defense" integer NOT NULL,
	"base_speed" integer NOT NULL,
	"base_charge" integer NOT NULL,
	"growth_rate" real DEFAULT 0.03 NOT NULL,
	"awakening_multiplier" real DEFAULT 1.5 NOT NULL,
	"awakening_duration_turns" integer DEFAULT 3 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creature_stats_creature_id_unique" UNIQUE("creature_id"),
	CONSTRAINT "creature_stats_hp_range" CHECK ("creature_stats"."base_hp" > 0 AND "creature_stats"."base_hp" <= 999),
	CONSTRAINT "creature_stats_attack_range" CHECK ("creature_stats"."base_attack" > 0 AND "creature_stats"."base_attack" <= 999),
	CONSTRAINT "creature_stats_defense_range" CHECK ("creature_stats"."base_defense" > 0 AND "creature_stats"."base_defense" <= 999),
	CONSTRAINT "creature_stats_speed_range" CHECK ("creature_stats"."base_speed" > 0 AND "creature_stats"."base_speed" <= 999),
	CONSTRAINT "creature_stats_charge_range" CHECK ("creature_stats"."base_charge" > 0 AND "creature_stats"."base_charge" <= 999),
	CONSTRAINT "creature_stats_growth_range" CHECK ("creature_stats"."growth_rate" > 0 AND "creature_stats"."growth_rate" <= 0.2),
	CONSTRAINT "creature_stats_duration_range" CHECK ("creature_stats"."awakening_duration_turns" >= 1 AND "creature_stats"."awakening_duration_turns" <= 10)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ability_stats" ADD CONSTRAINT "ability_stats_ability_id_abilities_id_fk" FOREIGN KEY ("ability_id") REFERENCES "public"."abilities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "capture_rules" ADD CONSTRAINT "capture_rules_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creature_abilities" ADD CONSTRAINT "creature_abilities_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creature_abilities" ADD CONSTRAINT "creature_abilities_ability_id_abilities_id_fk" FOREIGN KEY ("ability_id") REFERENCES "public"."abilities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creature_stats" ADD CONSTRAINT "creature_stats_creature_id_creatures_id_fk" FOREIGN KEY ("creature_id") REFERENCES "public"."creatures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
