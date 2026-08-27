ALTER TABLE "elements" ADD COLUMN "palette_shadow" text;--> statement-breakpoint
ALTER TABLE "elements" ADD COLUMN "palette_mid" text;--> statement-breakpoint
ALTER TABLE "elements" ADD COLUMN "palette_highlight" text;--> statement-breakpoint
ALTER TABLE "elements" ADD COLUMN "palette_aura" text;--> statement-breakpoint
ALTER TABLE "elements" ADD COLUMN "palette_spread" real DEFAULT 0 NOT NULL;