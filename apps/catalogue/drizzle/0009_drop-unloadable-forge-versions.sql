-- Crawls now leave out a version that only a forge's release list gives and whose manifest cannot be loaded: only a
-- guess from a tag, as a repository of several packages gives of every other package's tags. Remove those held, which
-- a crawl would otherwise remove only once it ran complete. A version Foundry VTT's listing offers has its `listing`,
-- and is kept, failed.
DELETE FROM "releases" WHERE "detail" = 'listed' AND "load_failed" AND "listing" IS NULL;
