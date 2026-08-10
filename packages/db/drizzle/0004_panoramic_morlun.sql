ALTER TABLE "creature_stats" ADD COLUMN "size_meters" real DEFAULT 1.8 NOT NULL;--> statement-breakpoint
ALTER TABLE "creature_stats" ADD COLUMN "real_size_meters" real;--> statement-breakpoint
ALTER TABLE "creature_stats" ADD CONSTRAINT "creature_stats_size_range" CHECK ("creature_stats"."size_meters" >= 0.9 AND "creature_stats"."size_meters" <= 4.5);--> statement-breakpoint
ALTER TABLE "creature_stats" ADD CONSTRAINT "creature_stats_real_size_range" CHECK ("creature_stats"."real_size_meters" IS NULL OR ("creature_stats"."real_size_meters" > 0 AND "creature_stats"."real_size_meters" <= 100));