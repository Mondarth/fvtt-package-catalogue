ALTER TABLE "crawl_requests" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crawl_requests" ADD COLUMN "not_before" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "crawl_requests_not_before_index" ON "crawl_requests" USING btree ("not_before");