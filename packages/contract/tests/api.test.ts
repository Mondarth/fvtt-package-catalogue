import { describe, expect, it } from 'vitest';

import {
  API_BASE,
  ErrorResponse,
  HealthResponse,
  MAX_UNIVERSE_PACKAGES,
  ReleasesResponse,
  StatusResponse,
  UNIVERSE_PATH,
  UniverseRequest,
  UniverseResponse,
  packageKey,
  releasesPath,
} from '../src/index.js';
import { listed } from './fixtures.js';

describe('paths', () => {
  it('are under the API version', () => {
    expect(API_BASE).toBe('/api/v1');
  });

  it("give a package's releases", () => {
    expect(releasesPath({ type: 'module', id: 'midi-qol' })).toBe('/api/v1/packages/module/midi-qol/releases');
  });

  it('encode the id', () => {
    expect(releasesPath({ type: 'module', id: 'a b' })).toBe('/api/v1/packages/module/a%20b/releases');
  });

  it('give the universe', () => {
    expect(UNIVERSE_PATH).toBe('/api/v1/universe');
  });
});

describe('UniverseRequest', () => {
  const ref = { type: 'module', id: 'midi-qol' } as const;

  it('names the packages to start from', () => {
    expect(UniverseRequest.parse({ packages: [ref] })).toEqual({ packages: [ref] });
  });

  it('names at least one package, and at most the limit', () => {
    expect(UniverseRequest.safeParse({ packages: [] }).success).toBe(false);
    const most = Array.from({ length: MAX_UNIVERSE_PACKAGES }, (_, i) => ({ type: 'module', id: `m${String(i)}` }));
    expect(UniverseRequest.safeParse({ packages: most }).success).toBe(true);
    expect(UniverseRequest.safeParse({ packages: [...most, ref] }).success).toBe(false);
  });

  it('refuses an id no package can have', () => {
    expect(UniverseRequest.safeParse({ packages: [{ type: 'module', id: 'a/b' }] }).success).toBe(false);
  });
});

describe('packageKey', () => {
  it("is the resolver's key", () => {
    expect(packageKey({ type: 'system', id: 'dnd5e' })).toBe('system:dnd5e');
  });
});

describe('responses', () => {
  it('give releases as of a time, or of none', () => {
    const body = { package: listed.package, releases: [listed], asOf: '2026-10-24T09:00:00.000Z' };
    expect(ReleasesResponse.parse(body)).toEqual(body);
    expect(ReleasesResponse.parse({ ...body, asOf: null }).asOf).toBeNull();
  });

  it('give the status of this API version only', () => {
    const status = { apiVersion: 'v1', version: '0.1.0', packages: 1, releases: 2, asOf: null };
    expect(StatusResponse.parse(status)).toEqual(status);
    expect(StatusResponse.safeParse({ ...status, apiVersion: 'v2' }).success).toBe(false);
  });

  it('give a universe, what could not be fetched, and what is not held yet', () => {
    const body = {
      universe: { core: [{ version: '14.368', generation: 14, channel: 'stable' }], releases: [listed] },
      gaps: [{ source: 'foundry-index', url: 'https://example.com', reason: 'http', status: 404, package: 'module:x' }],
      pending: [{ type: 'module', id: 'lib-wrapper' }],
      asOf: '2026-10-24T09:00:00.000Z',
    };
    expect(UniverseResponse.parse(body)).toEqual(body);
    expect(UniverseResponse.parse({ ...body, asOf: null }).asOf).toBeNull();
  });

  it('give health', () => {
    expect(HealthResponse.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('give errors with a code', () => {
    const error = { error: { code: 'not-found', message: 'No such package', requestId: 'abc' } };
    expect(ErrorResponse.parse(error)).toEqual(error);
    expect(ErrorResponse.safeParse({ error: { code: 'teapot', message: '' } }).success).toBe(false);
  });
});
