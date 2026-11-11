DROP INDEX IF EXISTS "owner_invoices_plan_period";--> statement-breakpoint
ALTER TABLE "owner_invoices" ADD COLUMN "credit_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_invoices" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "owner_reply_edited_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "owner_invoices_plan_tier_period" ON "owner_invoices" USING btree ("owner_plan_id","period_start","plan") WHERE "owner_invoices"."status" <> 'void';--> statement-breakpoint
-- Before the unique index: a phone the owner added twice at once (edge case T8) keeps one open stay, the active one
-- or else the oldest invite; the extra invites are withdrawn, and an extra active stay ends today.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "hostel_id", "phone" ORDER BY ("status" = 'active') DESC, "created_at", "id") AS n
  FROM "residencies"
  WHERE "source" = 'owner' AND "status" IN ('invited', 'active')
)
UPDATE "residencies" r
SET "status" = CASE WHEN r."status" = 'invited' THEN 'declined'::residency_status ELSE 'ended'::residency_status END,
    "end_date" = CASE WHEN r."status" = 'active' THEN greatest(r."start_date", (now() AT TIME ZONE 'Asia/Kolkata')::date) ELSE r."end_date" END
FROM ranked
WHERE ranked."id" = r."id" AND ranked.n > 1;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "residencies_one_open_owner_stay" ON "residencies" USING btree ("hostel_id","phone") WHERE "residencies"."source" = 'owner' and "residencies"."status" in ('invited', 'active');--> statement-breakpoint
ALTER TABLE "owner_invoices" ADD CONSTRAINT "owner_invoices_amounts_nonneg" CHECK ("owner_invoices"."amount" >= 0 and "owner_invoices"."credit_amount" >= 0);
