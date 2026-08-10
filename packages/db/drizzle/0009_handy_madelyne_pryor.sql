ALTER TABLE "items" ADD COLUMN "class_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_class_id_creature_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."creature_classes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
