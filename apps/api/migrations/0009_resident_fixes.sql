ALTER TABLE "issue_updates" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "move_requests" ADD COLUMN "cancel_reason" text;