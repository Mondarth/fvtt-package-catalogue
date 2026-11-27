CREATE TABLE "credit_eligibilities" (
	"credit_id" text NOT NULL,
	"eligibility_id" text NOT NULL,
	CONSTRAINT "credit_eligibilities_credit_id_eligibility_id_pk" PRIMARY KEY("credit_id","eligibility_id")
);
--> statement-breakpoint
CREATE TABLE "eligibilities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "offer_eligibilities" (
	"offer_id" text NOT NULL,
	"eligibility_id" text NOT NULL,
	CONSTRAINT "offer_eligibilities_offer_id_eligibility_id_pk" PRIMARY KEY("offer_id","eligibility_id")
);
--> statement-breakpoint
ALTER TABLE "credit_eligibilities" ADD CONSTRAINT "credit_eligibilities_credit_id_subscription_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."subscription_credits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_eligibilities" ADD CONSTRAINT "credit_eligibilities_eligibility_id_eligibilities_id_fk" FOREIGN KEY ("eligibility_id") REFERENCES "public"."eligibilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibilities" ADD CONSTRAINT "eligibilities_parent_id_eligibilities_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."eligibilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_eligibilities" ADD CONSTRAINT "offer_eligibilities_offer_id_subscription_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."subscription_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_eligibilities" ADD CONSTRAINT "offer_eligibilities_eligibility_id_eligibilities_id_fk" FOREIGN KEY ("eligibility_id") REFERENCES "public"."eligibilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_eligibilities_eligibility_id" ON "credit_eligibilities" USING btree ("eligibility_id");--> statement-breakpoint
CREATE INDEX "eligibilities_parent_id" ON "eligibilities" USING btree ("parent_id");--> statement-breakpoint
-- The eligibilities the accounts begin with: Mondarth, over its apps, the catalogue and AIDE.
INSERT INTO "eligibilities" ("id", "name", "description", "parent_id", "created_by") VALUES
	('mondarth', 'Mondarth', 'Everything Mondarth offers subscribers.', NULL, 'migration'),
	('apps', 'Apps', 'Every Mondarth app.', 'mondarth', 'migration'),
	('catalogue', 'Catalogue', 'EMMA''s package catalogue, and the EMMA extension.', 'apps', 'migration'),
	('aide', 'AIDE', 'AIDE.', 'apps', 'migration');--> statement-breakpoint
-- What was offered, bought and granted before was for the catalogue and the EMMA extension.
INSERT INTO "offer_eligibilities" ("offer_id", "eligibility_id")
	SELECT "id", 'catalogue' FROM "subscription_offers";--> statement-breakpoint
INSERT INTO "credit_eligibilities" ("credit_id", "eligibility_id")
	SELECT "id", 'catalogue' FROM "subscription_credits";--> statement-breakpoint
-- The Patreon pledge subscribes to the apps.
INSERT INTO "catalogue_settings" ("key", "value", "updated_by") VALUES ('patreon_eligibilities', '["apps"]', 'migration')
	ON CONFLICT ("key") DO NOTHING;
