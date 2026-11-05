import { describe, expect, it } from 'vitest';

import {
  API_V2_BASE,
  LOOKUP_PATH,
  LookupRequest,
  LookupResponse,
  MAX_UNIVERSE_PACKAGES,
  PackageRelease,
} from '../src/index.js';
import { loaded } from './fixtures.js';

describe('version 2', () => {
  it('is under its own base', () => {
    expect(API_V2_BASE).toBe('/api/v2');
    expect(LOOKUP_PATH).toBe('/api/v2/lookup');
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
