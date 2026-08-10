CREATE TABLE IF NOT EXISTS "relic_rules" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"capture_floor_pct" real DEFAULT 5 NOT NULL,
	"capture_ceil_pct" real DEFAULT 95 NOT NULL,
	"same_element_bonus_pct" real DEFAULT 15 NOT NULL,
	"same_class_bonus_pct" real DEFAULT 10 NOT NULL,
	"element_disadvantage_penalty_pct" real DEFAULT 15 NOT NULL,
	"xp_per_capture" integer DEFAULT 20 NOT NULL,
	"xp_curve_base" real DEFAULT 10 NOT NULL,
	"xp_curve_exponent" real DEFAULT 1.5 NOT NULL,
	"material_cost_base" integer DEFAULT 1 NOT NULL,
	"material_cost_level_step" integer DEFAULT 20 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relic_rules_singleton" CHECK ("relic_rules"."id" = 1),
	CONSTRAINT "relic_rules_capture_chance_order" CHECK ("relic_rules"."capture_floor_pct" >= 0 AND "relic_rules"."capture_floor_pct" <= "relic_rules"."capture_ceil_pct"
          AND "relic_rules"."capture_ceil_pct" <= 100),
	CONSTRAINT "relic_rules_bonus_range" CHECK ("relic_rules"."same_element_bonus_pct" >= 0 AND "relic_rules"."same_element_bonus_pct" <= 100
          AND "relic_rules"."same_class_bonus_pct" >= 0 AND "relic_rules"."same_class_bonus_pct" <= 100
          AND "relic_rules"."element_disadvantage_penalty_pct" >= 0 AND "relic_rules"."element_disadvantage_penalty_pct" <= 100),
	CONSTRAINT "relic_rules_xp_per_capture_range" CHECK ("relic_rules"."xp_per_capture" > 0 AND "relic_rules"."xp_per_capture" <= 1000),
	CONSTRAINT "relic_rules_xp_curve_base_range" CHECK ("relic_rules"."xp_curve_base" > 0::real AND "relic_rules"."xp_curve_base" <= 1000::real),
	CONSTRAINT "relic_rules_xp_curve_exponent_range" CHECK ("relic_rules"."xp_curve_exponent" >= 1::real AND "relic_rules"."xp_curve_exponent" <= 4::real),
	CONSTRAINT "relic_rules_material_cost_base_range" CHECK ("relic_rules"."material_cost_base" >= 0 AND "relic_rules"."material_cost_base" <= 100),
	CONSTRAINT "relic_rules_material_cost_level_step_range" CHECK ("relic_rules"."material_cost_level_step" > 0 AND "relic_rules"."material_cost_level_step" <= 999)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relic_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"relic_id" integer NOT NULL,
	"slot_capacity" integer NOT NULL,
	"base_capture_rate" integer NOT NULL,
	"capture_rate_per_level" real NOT NULL,
	"max_level" integer DEFAULT 30 NOT NULL,
	"combat_buff_base" real DEFAULT 0 NOT NULL,
	"combat_buff_per_level" real DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relic_stats_relic_id_unique" UNIQUE("relic_id"),
	CONSTRAINT "relic_stats_slot_range" CHECK ("relic_stats"."slot_capacity" >= 1 AND "relic_stats"."slot_capacity" <= 12),
	CONSTRAINT "relic_stats_base_capture_range" CHECK ("relic_stats"."base_capture_rate" >= 1 AND "relic_stats"."base_capture_rate" <= 500),
	CONSTRAINT "relic_stats_per_level_range" CHECK ("relic_stats"."capture_rate_per_level" >= 0 AND "relic_stats"."capture_rate_per_level" <= 100),
	CONSTRAINT "relic_stats_max_level_range" CHECK ("relic_stats"."max_level" >= 1 AND "relic_stats"."max_level" <= 999),
	CONSTRAINT "relic_stats_combat_buff_range" CHECK ("relic_stats"."combat_buff_base" >= 0 AND "relic_stats"."combat_buff_base" <= 100
          AND "relic_stats"."combat_buff_per_level" >= 0 AND "relic_stats"."combat_buff_per_level" <= 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relics" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"element_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relics_code_unique" UNIQUE("code")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "relic_stats" ADD CONSTRAINT "relic_stats_relic_id_relics_id_fk" FOREIGN KEY ("relic_id") REFERENCES "public"."relics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "relics" ADD CONSTRAINT "relics_element_id_elements_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."elements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "relics" ADD CONSTRAINT "relics_class_id_creature_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."creature_classes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
