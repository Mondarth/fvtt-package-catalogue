CREATE TYPE "public"."core_channel" AS ENUM('stable', 'testing', 'development', 'prototype');--> statement-breakpoint
CREATE TYPE "public"."crawl_reason" AS ENUM('request', 'closure', 'refresh');--> statement-breakpoint
CREATE TYPE "public"."gap_reason" AS ENUM('http', 'network', 'budget', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."package_type" AS ENUM('module', 'system', 'world');--> statement-breakpoint
CREATE TYPE "public"."relationship_kind" AS ENUM('requires', 'systems', 'conflicts', 'recommends');--> statement-breakpoint
CREATE TYPE "public"."release_detail" AS ENUM('listed', 'loaded');--> statement-breakpoint
CREATE TABLE "core_releases" (
	"version" text PRIMARY KEY NOT NULL,
	"generation" integer NOT NULL,
	"channel" "core_channel" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "crawl_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "package_type" NOT NULL,
	"package_id" text NOT NULL,
	"reason" "crawl_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crawl_requests_type_packageId_unique" UNIQUE("type","package_id")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "packages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "package_type" NOT NULL,
	"package_id" text NOT NULL,
	"title" text,
	"premium" boolean DEFAULT false NOT NULL,
	"listing_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_type_packageId_unique" UNIQUE("type","package_id")
);
--> statement-breakpoint
CREATE TABLE "raw_manifests" (
	"hash" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "relationships_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"release_ref" integer NOT NULL,
	"kind" "relationship_kind" NOT NULL,
	"position" smallint NOT NULL,
	"target_type" "package_type" NOT NULL,
	"target_id" text NOT NULL,
	"minimum" text,
	"maximum" text,
	"verified" text,
	"manifest" text,
	"reason" text,
	CONSTRAINT "relationships_releaseRef_kind_position_unique" UNIQUE("release_ref","kind","position")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "releases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"package_ref" integer NOT NULL,
	"version" text NOT NULL,
	"minimum" text,
	"maximum" text,
	"verified" text,
	"listing" jsonb,
	"manifest" text,
	"download" text,
	"version_manifest" text,
	"protected" boolean DEFAULT false NOT NULL,
	"origin" text NOT NULL,
	"detail" "release_detail" NOT NULL,
	"unlisted" boolean DEFAULT false NOT NULL,
	"load_failed" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"manifest_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_packageRef_version_unique" UNIQUE("package_ref","version")
);
--> statement-breakpoint
CREATE TABLE "source_gaps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "source_gaps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"url" text NOT NULL,
	"reason" "gap_reason" NOT NULL,
	"status" integer,
	"package_key" text,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"requests" integer DEFAULT 0 NOT NULL,
	"outcome" text,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_release_ref_releases_id_fk" FOREIGN KEY ("release_ref") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_package_ref_packages_id_fk" FOREIGN KEY ("package_ref") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_manifest_hash_raw_manifests_hash_fk" FOREIGN KEY ("manifest_hash") REFERENCES "public"."raw_manifests"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relationships_target_type_target_id_index" ON "relationships" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "source_gaps_package_key_index" ON "source_gaps" USING btree ("package_key");