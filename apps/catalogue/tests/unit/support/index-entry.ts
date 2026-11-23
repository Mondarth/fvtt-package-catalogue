import type { ListingDetails } from '../../../src/lib/server/refresh.js';

/** What the index says of a package that it gives no more of than its id, type and dates. */
export const NO_DETAILS: ListingDetails = {
  summary: null,
  author: null,
  provider: null,
  url: null,
  marketplaceUrl: null,
  tags: [],
  systems: [],
  exclusive: false,
  status: null,
  latestVersion: null,
  versions: [],
};
