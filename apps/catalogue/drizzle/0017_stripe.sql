CREATE TABLE "subscription_checkouts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"provider" text NOT NULL,
	"session_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"credit_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_offers" ADD COLUMN "provider_refs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_checkouts" ADD CONSTRAINT "subscription_checkouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_checkouts" ADD CONSTRAINT "subscription_checkouts_offer_id_subscription_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."subscription_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_checkouts" ADD CONSTRAINT "subscription_checkouts_credit_id_subscription_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."subscription_credits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_checkouts_user_id" ON "subscription_checkouts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_checkouts_provider_session" ON "subscription_checkouts" USING btree ("provider","session_id");