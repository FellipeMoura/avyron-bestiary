CREATE TABLE IF NOT EXISTS "arena_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"npc_id" integer NOT NULL,
	"stage" integer NOT NULL,
	"opponent_creature_id" integer NOT NULL,
	"opponent_level" integer NOT NULL,
	"reward_currency" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_stages_npc_stage_unique" UNIQUE("npc_id","stage"),
	CONSTRAINT "arena_stages_stage_range" CHECK ("arena_stages"."stage" >= 1),
	CONSTRAINT "arena_stages_level_range" CHECK ("arena_stages"."opponent_level" >= 1),
	CONSTRAINT "arena_stages_reward_range" CHECK ("arena_stages"."reward_currency" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "arena_stages" ADD CONSTRAINT "arena_stages_npc_id_npcs_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "arena_stages" ADD CONSTRAINT "arena_stages_opponent_creature_id_creatures_id_fk" FOREIGN KEY ("opponent_creature_id") REFERENCES "public"."creatures"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
