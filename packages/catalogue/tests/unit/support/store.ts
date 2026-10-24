import { vi } from 'vitest';

import type { CatalogueStore } from '../../../src/lib/server/store/types.js';

/** A store whose every method is a mock, answering as an empty catalogue unless told otherwise. */
export function mockStore(): { [K in keyof CatalogueStore]: ReturnType<typeof vi.fn<CatalogueStore[K]>> } {
  return {
    ping: vi.fn<CatalogueStore['ping']>().mockResolvedValue(undefined),
    status: vi.fn<CatalogueStore['status']>().mockResolvedValue({ packages: 0, releases: 0, asOf: null }),
    releasesOf: vi.fn<CatalogueStore['releasesOf']>().mockResolvedValue(undefined),
    saveReleases: vi.fn<CatalogueStore['saveReleases']>().mockResolvedValue(undefined),
  };
}
