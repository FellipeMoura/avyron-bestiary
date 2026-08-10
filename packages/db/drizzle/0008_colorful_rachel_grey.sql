ALTER TYPE "public"."item_category" ADD VALUE 'material';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "progression_rules" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"xp_curve_base" real DEFAULT 14 NOT NULL,
	"xp_curve_exponent" real DEFAULT 1.7 NOT NULL,
	"xp_yield_divisor" real DEFAULT 5 NOT NULL,
	"item_cost_base" integer DEFAULT 1 NOT NULL,
	"item_cost_level_step" integer DEFAULT 20 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progression_rules_singleton" CHECK ("progression_rules"."id" = 1),
	CONSTRAINT "progression_rules_xp_curve_base_range" CHECK ("progression_rules"."xp_curve_base" > 0::real AND "progression_rules"."xp_curve_base" <= 1000::real),
	CONSTRAINT "progression_rules_xp_curve_exponent_range" CHECK ("progression_rules"."xp_curve_exponent" >= 1::real AND "progression_rules"."xp_curve_exponent" <= 4::real),
	CONSTRAINT "progression_rules_xp_yield_divisor_range" CHECK ("progression_rules"."xp_yield_divisor" > 0::real AND "progression_rules"."xp_yield_divisor" <= 100::real),
	CONSTRAINT "progression_rules_item_cost_base_range" CHECK ("progression_rules"."item_cost_base" >= 0 AND "progression_rules"."item_cost_base" <= 100),
	CONSTRAINT "progression_rules_item_cost_level_step_range" CHECK ("progression_rules"."item_cost_level_step" > 0 AND "progression_rules"."item_cost_level_step" <= 999)
);
--> statement-breakpoint
ALTER TABLE "creature_stats" ADD COLUMN "xp_yield" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "creature_stats" ADD CONSTRAINT "creature_stats_xp_yield_range" CHECK ("creature_stats"."xp_yield" > 0 AND "creature_stats"."xp_yield" <= 500);