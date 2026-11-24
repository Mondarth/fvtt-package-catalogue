-- Crawls now keep releases newer than Foundry VTT's listing offers, marked unlisted. Queue every package held for one
-- crawl, so that those it already has appear without waiting for its listing to change. A package already queued
-- keeps its reason.
INSERT INTO "crawl_requests" ("type", "package_id", "reason")
SELECT "type", "package_id", 'refresh' FROM "packages"
ON CONFLICT ("type", "package_id") DO NOTHING;
