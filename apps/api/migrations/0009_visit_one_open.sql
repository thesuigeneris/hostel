-- Earlier double submits may have left two waiting requests for the same person and hostel. Keep the first one.
UPDATE "visit_requests" AS v SET "status" = 'closed'
WHERE v."status" = 'new' AND EXISTS (
  SELECT 1 FROM "visit_requests" AS o
  WHERE o."hostel_id" = v."hostel_id" AND o."user_id" = v."user_id" AND o."status" = 'new'
    AND (o."created_at", o."id") < (v."created_at", v."id")
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "visit_requests_one_open" ON "visit_requests" USING btree ("hostel_id","user_id") WHERE "visit_requests"."status" = 'new';
