CREATE TYPE "public"."item_category" AS ENUM('mineral', 'capture', 'heal');--> statement-breakpoint
CREATE TYPE "public"."item_effect" AS ENUM('none', 'capture_bonus', 'heal_flat', 'heal_percent');--> statement-breakpoint
CREATE TYPE "public"."npc_role" AS ENUM('merchant', 'duelist', 'quest', 'flavor');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merchant_offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"npc_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"price" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_offers_npc_item_unique" UNIQUE("npc_id","item_id"),
	CONSTRAINT "merchant_offers_price_range" CHECK ("merchant_offers"."price" IS NULL OR "merchant_offers"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "economy_rules" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"currency_name" text DEFAULT 'Óbolo' NOT NULL,
	"currency_name_plural" text DEFAULT 'Óbolos' NOT NULL,
	"starting_currency" integer DEFAULT 120 NOT NULL,
	"sell_ratio" real DEFAULT 0.4 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_rules_singleton" CHECK ("economy_rules"."id" = 1),
	CONSTRAINT "economy_rules_sell_ratio_range" CHECK ("economy_rules"."sell_ratio" > 0 AND "economy_rules"."sell_ratio" < 1),
	CONSTRAINT "economy_rules_starting_range" CHECK ("economy_rules"."starting_currency" >= 0 AND "economy_rules"."starting_currency" <= 1000000)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"effect_code" "item_effect" DEFAULT 'none' NOT NULL,
	"effect_value" real DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_stats_item_id_unique" UNIQUE("item_id"),
	CONSTRAINT "item_stats_value_range" CHECK ("item_stats"."value" >= 0 AND "item_stats"."value" <= 1000000),
	CONSTRAINT "item_stats_effect_value_range" CHECK ("item_stats"."effect_value" >= 0 AND "item_stats"."effect_value" <= 1000)
);
--> statement-breakpoint
-- text -> enum: editado a mao. O drizzle-kit emite `SET DATA TYPE` seco, e o
-- Postgres recusa ("column cannot be cast automatically") mesmo com a tabela
-- vazia, porque a conversao e do tipo e nao das linhas. O USING resolve.
--
-- O backfill de NULL vem antes do NOT NULL: hoje as 12 linhas de `items` sao
-- todas 'mineral' e `npcs` esta vazia, mas um banco de dev antigo pode ter
-- nulos, e ai a migration falharia na maquina de outra pessoa em vez de aqui.
UPDATE "items" SET "category" = 'mineral' WHERE "category" IS NULL;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "category" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "category" SET DATA TYPE item_category USING "category"::item_category;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "category" SET DEFAULT 'mineral';--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
UPDATE "npcs" SET "role" = 'flavor' WHERE "role" IS NULL;--> statement-breakpoint
ALTER TABLE "npcs" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "npcs" ALTER COLUMN "role" SET DATA TYPE npc_role USING "role"::npc_role;--> statement-breakpoint
ALTER TABLE "npcs" ALTER COLUMN "role" SET DEFAULT 'flavor';--> statement-breakpoint
ALTER TABLE "npcs" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "merchant_offers" ADD CONSTRAINT "merchant_offers_npc_id_npcs_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "merchant_offers" ADD CONSTRAINT "merchant_offers_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_stats" ADD CONSTRAINT "item_stats_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
