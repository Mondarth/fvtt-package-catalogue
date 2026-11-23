-- A package's own manifest gives its title, which a package Foundry VTT's index does not list has from nowhere else:
-- kept as each own manifest is read, about hourly.
ALTER TABLE "packages" ADD COLUMN "own_title" text;
