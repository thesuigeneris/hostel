CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "partner_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"hostel_id" text NOT NULL,
	"status" "partner_status" DEFAULT 'applied' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"reason" text,
	"decided_by" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partner_applications_hostel_idx" ON "partner_applications" USING btree ("hostel_id","applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "partner_applications_one_open" ON "partner_applications" USING btree ("hostel_id") WHERE "partner_applications"."status" = 'applied';--> statement-breakpoint
-- Backfill an application row for hostels that applied or were decided before this table existed.
INSERT INTO "partner_applications" ("id", "hostel_id", "status", "checklist", "applied_at", "decided_at")
SELECT 'pap_' || substr(md5(random()::text || h.id), 1, 16), h.id, h.partner_status,
       CASE WHEN h.partner_status = 'verified' THEN '["photos_match","beds_bedding","bathrooms","drinking_water","kitchen_hygiene","fire_safety","security","wifi_power","documents","brand_terms"]'::jsonb ELSE '[]'::jsonb END,
       h.created_at, CASE WHEN h.partner_status = 'applied' THEN NULL ELSE h.created_at END
FROM "hostels" h
WHERE h.partner_status <> 'none'
  AND NOT EXISTS (SELECT 1 FROM "partner_applications" a WHERE a.hostel_id = h.id);