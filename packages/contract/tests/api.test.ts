import { describe, expect, it } from 'vitest';

import {
  ErrorResponse,
  HealthResponse,
  STATUS_PATH,
  StatusResponse,
  UnavailablePackage,
  packageKey,
} from '../src/index.js';

describe('packageKey', () => {
  it("is the resolver's key", () => {
    expect(packageKey({ type: 'system', id: 'dnd5e' })).toBe('system:dnd5e');
  });
});

describe('responses', () => {
  it('give the status, under version 2, of that version only', () => {
    expect(STATUS_PATH).toBe('/api/v2/status');
    const status = { apiVersion: 'v2', version: '0.7.0', packages: 1, releases: 2, asOf: null, consistency: null };
    expect(StatusResponse.parse(status)).toEqual(status);
    expect(StatusResponse.safeParse({ ...status, apiVersion: 'v1' }).success).toBe(false);
  });

  it('give how the catalogue last compared with the index, or that it never has', () => {
    const consistency = {
      at: '2026-11-05T03:00:00.000Z',
      listed: 6724,
      held: 6500,
      versionsMissing: 3,
      latestMissing: 1,
      listingsDiffer: 2,
      archivedHeld: 0,
      ownMissing: 4,
      requeued: 9,
    };
    const status = { apiVersion: 'v2', version: '0.7.0', packages: 1, releases: 2, asOf: null };
    expect(StatusResponse.parse({ ...status, consistency }).consistency).toEqual(consistency);
    expect(StatusResponse.parse({ ...status, consistency: null }).consistency).toBeNull();
    expect(StatusResponse.safeParse({ ...status, consistency: { ...consistency, held: -1 } }).success).toBe(false);
  });

  it('give the packages that cannot be had, and why', () => {
    const archived = { package: { type: 'module', id: 'babonus' }, reason: 'archived' };
    const gone = { package: { type: 'module', id: 'lost' }, reason: 'gone', note: 'Its repository was deleted' };
    expect(UnavailablePackage.parse(archived)).toEqual(archived);
    expect(UnavailablePackage.parse(gone)).toEqual(gone);
    expect(UnavailablePackage.safeParse({ ...archived, reason: 'hidden' }).success).toBe(false);
    expect(UnavailablePackage.safeParse({ ...gone, note: '' }).success).toBe(false);
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
