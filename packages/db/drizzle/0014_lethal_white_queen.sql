ALTER TABLE "relic_stats" DROP CONSTRAINT "relic_stats_combat_buff_range";--> statement-breakpoint
ALTER TABLE "relic_stats" DROP COLUMN IF EXISTS "combat_buff_base";--> statement-breakpoint
ALTER TABLE "relic_stats" DROP COLUMN IF EXISTS "combat_buff_per_level";