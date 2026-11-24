CREATE TABLE "access_records" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "access_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"path" text,
	"client" text,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text NOT NULL,
	"as_user_id" text,
	"action" text NOT NULL,
	"subject_id" text,
	"before" jsonb,
	"after" jsonb,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "device_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp with time zone,
	"polling_interval" integer,
	"client_id" text,
	"scope" text,
	CONSTRAINT "device_codes_deviceCode_unique" UNIQUE("device_code"),
	CONSTRAINT "device_codes_userCode_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "last_sessions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_active_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"client_id" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"handle" text NOT NULL,
	"nickname" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patreon_memberships" (
	"user_id" text PRIMARY KEY NOT NULL,
	"patron_status" text,
	"amount" integer,
	"next_charge_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"asked_at" timestamp with time zone NOT NULL,
	"failure" text
);
--> statement-breakpoint
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
CREATE TABLE "subscription_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"provider" text,
	"method" text,
	"external_ref" text,
	"provider_account" text,
	"offer_id" text,
	"amount_paid" integer,
	"currency_paid" text,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"refunded_at" timestamp with time zone,
	"refund_requested_at" timestamp with time zone,
	"refund_reason" text,
	"refund_reason_text" text,
	"disputed" text,
	"disputed_at" timestamp with time zone,
	"months" integer DEFAULT 0 NOT NULL,
	"days" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"granted_by" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"months" integer DEFAULT 0 NOT NULL,
	"days" integer DEFAULT 0 NOT NULL,
	"prices" jsonb NOT NULL,
	"providers" text[] DEFAULT '{}'::text[] NOT NULL,
	"provider_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"available_from" timestamp with time zone,
	"available_until" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_records" ADD CONSTRAINT "access_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_codes" ADD CONSTRAINT "device_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_sessions" ADD CONSTRAINT "last_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patreon_memberships" ADD CONSTRAINT "patreon_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_checkouts" ADD CONSTRAINT "subscription_checkouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_checkouts" ADD CONSTRAINT "subscription_checkouts_offer_id_subscription_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."subscription_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_checkouts" ADD CONSTRAINT "subscription_checkouts_credit_id_subscription_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."subscription_credits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_credits" ADD CONSTRAINT "subscription_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_credits" ADD CONSTRAINT "subscription_credits_offer_id_subscription_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."subscription_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_records_user_id" ON "access_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_subject_id" ON "audit_log" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "device_codes_user_id" ON "device_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_nickname_key" ON "users" USING btree (lower("nickname"));--> statement-breakpoint
CREATE INDEX "verifications_identifier" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "subscription_checkouts_user_id" ON "subscription_checkouts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_checkouts_provider_session" ON "subscription_checkouts" USING btree ("provider","session_id");--> statement-breakpoint
CREATE INDEX "subscription_credits_user_id" ON "subscription_credits" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_credits_provider_ref" ON "subscription_credits" USING btree ("provider","external_ref");