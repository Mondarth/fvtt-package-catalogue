-- Crawls now load a package Foundry VTT's index archives, as Foundry VTT still installs it from a manifest that names
-- it, such as a dependent's `requires`. Queue each held as archived for one crawl, so that those that load are held
-- without waiting for them to fall due. A package already queued keeps its reason.
INSERT INTO "crawl_requests" ("type", "package_id", "reason")
SELECT "type", "package_id", 'refresh' FROM "packages" WHERE "unavailable" = 'archived'
ON CONFLICT ("type", "package_id") DO NOTHING;
