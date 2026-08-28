CREATE TYPE "public"."creature_stat" AS ENUM('hp', 'attack', 'defense', 'speed', 'charge');--> statement-breakpoint
ALTER TABLE "creature_classes" DROP COLUMN IF EXISTS "biological_scope";