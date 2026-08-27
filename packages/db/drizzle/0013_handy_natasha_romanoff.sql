CREATE TYPE "public"."character_gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "npc_appearances" (
	"id" serial PRIMARY KEY NOT NULL,
	"npc_id" integer NOT NULL,
	"gender" character_gender NOT NULL,
	"hair" text,
	"eyebrows" text,
	"beard" text,
	"outfit_body" text NOT NULL,
	"outfit_arms" text NOT NULL,
	"outfit_legs" text NOT NULL,
	"outfit_feet" text NOT NULL,
	"outfit_head" text,
	"outfit_accessory" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "npc_appearances_npc_id_unique" UNIQUE("npc_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "npc_appearances" ADD CONSTRAINT "npc_appearances_npc_id_npcs_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
