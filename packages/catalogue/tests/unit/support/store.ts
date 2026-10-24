import { vi } from 'vitest';

import type { CatalogueStore } from '../../../src/lib/server/store/types.js';

/** A store whose every method is a mock, answering as an empty catalogue unless told otherwise. */
export function mockStore(): { [K in keyof CatalogueStore]: ReturnType<typeof vi.fn<CatalogueStore[K]>> } {
  return {
    ping: vi.fn<CatalogueStore['ping']>().mockResolvedValue(undefined),
    status: vi.fn<CatalogueStore['status']>().mockResolvedValue({ packages: 0, releases: 0, asOf: null }),
    releasesOf: vi.fn<CatalogueStore['releasesOf']>().mockResolvedValue(undefined),
    releasesOfEach: vi.fn<CatalogueStore['releasesOfEach']>().mockResolvedValue(new Map()),
    saveReleases: vi.fn<CatalogueStore['saveReleases']>().mockResolvedValue(undefined),
    coreReleases: vi.fn<CatalogueStore['coreReleases']>().mockResolvedValue([]),
    saveCoreReleases: vi.fn<CatalogueStore['saveCoreReleases']>().mockResolvedValue(undefined),
    gapsOf: vi.fn<CatalogueStore['gapsOf']>().mockResolvedValue([]),
    recordGaps: vi.fn<CatalogueStore['recordGaps']>().mockResolvedValue(undefined),
    requestCrawl: vi.fn<CatalogueStore['requestCrawl']>().mockResolvedValue(undefined),
    nextCrawl: vi.fn<CatalogueStore['nextCrawl']>().mockResolvedValue(undefined),
    finishCrawl: vi.fn<CatalogueStore['finishCrawl']>().mockResolvedValue(undefined),
    deferCrawl: vi.fn<CatalogueStore['deferCrawl']>().mockResolvedValue(undefined),
    replaceGaps: vi.fn<CatalogueStore['replaceGaps']>().mockResolvedValue(undefined),
    declaredManifests: vi.fn<CatalogueStore['declaredManifests']>().mockResolvedValue([]),
    unknownOf: vi.fn<CatalogueStore['unknownOf']>().mockImplementation(refs => Promise.resolve([...refs])),
    startRun: vi.fn<CatalogueStore['startRun']>().mockResolvedValue(1),
    finishRun: vi.fn<CatalogueStore['finishRun']>().mockResolvedValue(undefined),
    lastSuccess: vi.fn<CatalogueStore['lastSuccess']>().mockResolvedValue(null),
  };
}
