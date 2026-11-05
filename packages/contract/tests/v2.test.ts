import { describe, expect, it } from 'vitest';

import {
  API_V2_BASE,
  CORE_PATH,
  CoreResponse,
  LISTING_PATH,
  ListingResponse,
  LOOKUP_PATH,
  LookupRequest,
  LookupResponse,
  MAX_UNIVERSE_PACKAGES,
  MAX_RECHECK_PACKAGES,
  PackageRelease,
  RECHECK_PATH,
  RecheckRequest,
  RecheckResponse,
} from '../src/index.js';
import { loaded } from './fixtures.js';

describe('version 2', () => {
  it('is under its own base', () => {
    expect(API_V2_BASE).toBe('/api/v2');
    expect(LOOKUP_PATH).toBe('/api/v2/lookup');
    expect(LISTING_PATH).toBe('/api/v2/listing');
    expect(CORE_PATH).toBe('/api/v2/core');
    expect(RECHECK_PATH).toBe('/api/v2/recheck');
  });
});

describe('LookupRequest', () => {
  const midi = { type: 'module', id: 'midi-qol' } as const;

  it('takes packages with what the client knows of them, and a generation to look from', () => {
    const request = {
      packages: [
        { ...midi, installed: '13.0.4', manifest: 'https://example.com/module.json' },
        { type: 'system', id: 'dnd5e' },
      ],
      fromGeneration: 14,
    };
    expect(LookupRequest.parse(request)).toEqual(request);
  });

  it('refuses none, too many, a manifest that is not a URL and a generation that is not one', () => {
    expect(LookupRequest.safeParse({ packages: [] }).success).toBe(false);
    expect(
      LookupRequest.safeParse({ packages: Array.from({ length: MAX_UNIVERSE_PACKAGES + 1 }, () => midi) }).success,
    ).toBe(false);
    expect(LookupRequest.safeParse({ packages: [{ ...midi, manifest: 'module.json' }] }).success).toBe(false);
    expect(LookupRequest.safeParse({ packages: [midi], fromGeneration: 0 }).success).toBe(false);
    expect(LookupRequest.safeParse({ packages: [midi], fromGeneration: 13.5 }).success).toBe(false);
  });
});

describe('LookupResponse', () => {
  const { package: ref, ...release } = loaded;

  it('gives each package once, with its releases without their package, and how fresh it is', () => {
    const response = {
      core: [{ version: '14.368', generation: 14, channel: 'stable' }],
      packages: [
        {
          package: ref,
          title: 'Midi QOL',
          latest: null,
          premium: false,
          syncedAt: '2026-11-05T09:00:00.000Z',
          own: { version: '13.0.4', readAt: '2026-11-05T09:30:00.000Z', checkedAt: '2026-11-05T09:30:00.000Z' },
          releases: [release],
        },
      ],
      pending: [{ package: { type: 'module', id: 'new' }, retryAfter: 30 }],
      unavailable: [{ package: { type: 'module', id: 'old' }, reason: 'archived' }],
      unreached: [{ type: 'module', id: 'flaky' }],
      asOf: '2026-11-05T09:00:00.000Z',
    };
    expect(LookupResponse.parse(response)).toEqual(response);
  });

  it('takes a release without its package, and drops one given with it', () => {
    expect(PackageRelease.parse(release)).toEqual(release);
    expect(PackageRelease.parse(loaded)).toEqual(release);
  });

  it('refuses a wait that is not some seconds', () => {
    const empty = { core: [], packages: [], unavailable: [], unreached: [], asOf: null };
    expect(LookupResponse.safeParse({ ...empty, pending: [] }).success).toBe(true);
    expect(LookupResponse.safeParse({ ...empty, pending: [{ package: ref, retryAfter: 0 }] }).success).toBe(false);
  });
});

describe('ListingResponse', () => {
  it('gives each package the listing offers, with a version for each line of builds', () => {
    const response = {
      packages: [
        {
          package: { type: 'module', id: 'midi-qol' },
          title: 'Midi QOL',
          summary: 'Automation',
          author: 'tim posney',
          url: 'https://github.com/tposney/midi-qol',
          tags: ['combat'],
          systems: ['dnd5e'],
          premium: false,
          exclusive: false,
          latest: null,
          versions: [
            {
              version: '14.0.20',
              minimum: '14.368',
              maximum: '14.999',
              verified: '14.368',
              manifest: 'https://example.com/14.0.20/module.json',
              notes: null,
            },
          ],
        },
      ],
      asOf: '2026-11-05T09:00:00.000Z',
    };
    expect(ListingResponse.parse(response)).toEqual(response);
  });

  it('refuses a version with no version', () => {
    const version = { version: '', minimum: null, maximum: null, verified: null, manifest: null, notes: null };
    const pkg = {
      package: { type: 'module', id: 'a' },
      title: 'A',
      summary: null,
      author: null,
      url: null,
      tags: [],
      systems: [],
      premium: false,
      exclusive: false,
      latest: null,
      versions: [version],
    };
    expect(ListingResponse.safeParse({ packages: [pkg], asOf: null }).success).toBe(false);
  });
});

describe('CoreResponse', () => {
  it("gives Foundry VTT's builds", () => {
    const response = { core: [{ version: '14.368', generation: 14, channel: 'stable' }] };
    expect(CoreResponse.parse(response)).toEqual(response);
  });
});

describe('rechecks', () => {
  const midi = { type: 'module', id: 'midi-qol' } as const;

  it('take some packages, and no more than a user means to see fresh', () => {
    expect(RecheckRequest.parse({ packages: [midi] })).toEqual({ packages: [midi] });
    expect(RecheckRequest.safeParse({ packages: [] }).success).toBe(false);
    expect(
      RecheckRequest.safeParse({ packages: Array.from({ length: MAX_RECHECK_PACKAGES + 1 }, () => midi) }).success,
    ).toBe(false);
  });

  it('give what each own manifest gives now, and what is queued for it', () => {
    const response = {
      packages: [
        {
          package: midi,
          own: { version: '14.0.21', readAt: '2026-11-05T10:00:00.000Z', checkedAt: '2026-11-05T10:00:00.000Z' },
          changed: true,
        },
      ],
      pending: [{ package: midi, retryAfter: 30 }],
    };
    expect(RecheckResponse.parse(response)).toEqual(response);
  });
});
