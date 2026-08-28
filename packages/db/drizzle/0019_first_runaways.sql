ALTER TABLE "creature_classes" ADD COLUMN "primary_stat" "creature_stat";--> statement-breakpoint
ALTER TABLE "creature_classes" ADD COLUMN "primary_stat_bonus_pct" real DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "creature_classes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "creature_classes" ADD CONSTRAINT "creature_classes_primary_stat_bonus_range" CHECK ("creature_classes"."primary_stat_bonus_pct" >= 0);