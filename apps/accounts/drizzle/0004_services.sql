CREATE TABLE "credit_services" (
	"credit_id" text NOT NULL,
	"service_id" text NOT NULL,
	CONSTRAINT "credit_services_credit_id_service_id_pk" PRIMARY KEY("credit_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "offer_services" (
	"offer_id" text NOT NULL,
	"service_id" text NOT NULL,
	CONSTRAINT "offer_services_offer_id_service_id_pk" PRIMARY KEY("offer_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_services" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "credit_services" ADD CONSTRAINT "credit_services_credit_id_subscription_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."subscription_credits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_services" ADD CONSTRAINT "credit_services_service_id_subscription_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."subscription_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_services" ADD CONSTRAINT "offer_services_offer_id_subscription_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."subscription_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_services" ADD CONSTRAINT "offer_services_service_id_subscription_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."subscription_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_services" ADD CONSTRAINT "subscription_services_parent_id_subscription_services_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."subscription_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_services_service_id" ON "credit_services" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "subscription_services_parent_id" ON "subscription_services" USING btree ("parent_id");--> statement-breakpoint
-- The services the accounts begin with: Mondarth, over Apps, over the Catalogue and AIDE.
INSERT INTO "subscription_services" ("id", "name", "description", "parent_id", "created_by") VALUES
	('mondarth', 'Mondarth', 'Everything Mondarth offers subscribers.', NULL, 'migration'),
	('apps', 'Apps', 'Every Mondarth app.', 'mondarth', 'migration'),
	('catalogue', 'Catalogue', 'EMMA''s package catalogue, and the EMMA extension.', 'apps', 'migration'),
	('aide', 'AIDE', 'AIDE.', 'apps', 'migration');--> statement-breakpoint
-- What was offered, bought and granted before was for the catalogue and the EMMA extension.
INSERT INTO "offer_services" ("offer_id", "service_id")
	SELECT "id", 'catalogue' FROM "subscription_offers";--> statement-breakpoint
INSERT INTO "credit_services" ("credit_id", "service_id")
	SELECT "id", 'catalogue' FROM "subscription_credits";--> statement-breakpoint
-- The Patreon pledge gives access to the apps.
INSERT INTO "catalogue_settings" ("key", "value", "updated_by") VALUES ('patreon_services', '["apps"]', 'migration')
	ON CONFLICT ("key") DO NOTHING;
