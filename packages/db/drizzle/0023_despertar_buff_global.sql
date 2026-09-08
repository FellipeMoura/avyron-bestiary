ALTER TABLE "awakenings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "awakenings" CASCADE;--> statement-breakpoint
ALTER TABLE "capture_rules" DROP CONSTRAINT "capture_rules_awakened_range";--> statement-breakpoint
ALTER TABLE "creature_stats" DROP CONSTRAINT "creature_stats_duration_range";--> statement-breakpoint
ALTER TABLE "combat_rules" ADD COLUMN "awakening_multiplier" real DEFAULT 1.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "combat_rules" ADD COLUMN "awakening_duration_turns" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_rules" DROP COLUMN IF EXISTS "awakened_multiplier";--> statement-breakpoint
ALTER TABLE "creature_stats" DROP COLUMN IF EXISTS "awakening_multiplier";--> statement-breakpoint
ALTER TABLE "creature_stats" DROP COLUMN IF EXISTS "awakening_duration_turns";--> statement-breakpoint
ALTER TABLE "combat_rules" ADD CONSTRAINT "combat_rules_awakening_multiplier_range" CHECK ("combat_rules"."awakening_multiplier" >= 1::real AND "combat_rules"."awakening_multiplier" <= 3::real);--> statement-breakpoint
ALTER TABLE "combat_rules" ADD CONSTRAINT "combat_rules_awakening_duration_range" CHECK ("combat_rules"."awakening_duration_turns" >= 1 AND "combat_rules"."awakening_duration_turns" <= 10);--> statement-breakpoint
DROP TYPE "public"."awakening_type";