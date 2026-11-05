import { describe, expect, it } from 'vitest';

import { checkConsistency } from '../../../src/lib/server/consistency.js';

import type { CheckedPackage, IndexedPackage } from '../../../src/lib/server/consistency.js';
import type { ListedVersion } from '../../../src/lib/server/refresh.js';

const ref = (id: string) => ({ type: 'module', id }) as const;

const version = (given: string, change: Partial<ListedVersion> = {}): ListedVersion => ({
  version: given,
  minimum: '14',
  maximum: null,
  verified: '14.368',
  manifest: null,
  notes: null,
  ...change,
});

const indexed = (id: string, change: Partial<IndexedPackage> = {}): IndexedPackage => ({
  ref: ref(id),
  archived: false,
  latestVersion: null,
  versions: [version('1.0.0')],
  ...change,
});

const held = (id: string, change: Partial<CheckedPackage> = {}): CheckedPackage => ({
  ref: ref(id),
  unavailable: null,
  ownVersion: null,
  releases: [{ version: '1.0.0', listing: { minimum: '14', verified: '14.368' } }],
  ...change,
});

const NONE = {
  listed: 0,
  held: 0,
  versionsMissing: 0,
  latestMissing: 0,
  listingsDiffer: 0,
  archivedHeld: 0,
  ownMissing: 0,
  concerned: [],
};

describe('checkConsistency', () => {
  it('finds nothing to put right when the catalogue holds what the index lists', () => {
    expect(checkConsistency([indexed('a')], [held('a')], {})).toEqual({ ...NONE, listed: 1, held: 1 });
  });

  it('counts the packages listed, not archived, and those of them held', () => {
    expect(
      checkConsistency([indexed('a'), indexed('b'), indexed('old', { archived: true })], [held('a')], {}),
    ).toMatchObject({ listed: 2, held: 1, concerned: [] });
  });

  it('finds versions the index lists that are not held, a leading "v" aside', () => {
    const found = checkConsistency(
      [indexed('a', { versions: [version('1.0.0'), version('v2.0.0'), version('3.0.0')] })],
      [held('a', { releases: [{ version: '1.0.0' }, { version: '2.0.0' }] })],
      {},
    );
    expect(found).toMatchObject({ versionsMissing: 1, concerned: [ref('a')] });
  });

  it('does not look for a version an override says is not a release', () => {
    const found = checkConsistency(
      [indexed('a', { versions: [version('1.0.0'), version('99.test')], latestVersion: '99.test' })],
      [held('a', { ownVersion: '99.test' })],
      { 'module:a': { reason: 'A test build', ignoreVersions: ['99.test'] } },
    );
    expect(found).toEqual({ ...NONE, listed: 1, held: 1 });
  });

  it('finds the newest version, where the index gives it, not held', () => {
    expect(checkConsistency([indexed('a', { latestVersion: '1.0.1' })], [held('a')], {})).toMatchObject({
      latestMissing: 1,
      concerned: [ref('a')],
    });
    expect(checkConsistency([indexed('a', { latestVersion: '1.0.0' })], [held('a')], {})).toMatchObject({
      latestMissing: 0,
    });
  });

  it("finds releases whose listing is not the index's, and compares none the catalogue holds no listing of", () => {
    const listing = (minimum: string | undefined, verified: string | undefined) =>
      held('a', {
        releases: [
          {
            version: '1.0.0',
            listing: { ...(minimum !== undefined && { minimum }), ...(verified !== undefined && { verified }) },
          },
        ],
      });
    const index = [indexed('a')];
    expect(checkConsistency(index, [listing('14', '14.368')], {}).listingsDiffer).toBe(0);
    expect(checkConsistency(index, [listing('13', '14.368')], {}).listingsDiffer).toBe(1);
    expect(checkConsistency(index, [listing('14', '14.369')], {}).listingsDiffer).toBe(1);
    expect(checkConsistency(index, [listing('14', undefined)], {}).listingsDiffer).toBe(1);
    expect(
      checkConsistency(
        [indexed('a', { versions: [version('1.0.0', { verified: null })] })],
        [listing('14', undefined)],
        {},
      ).listingsDiffer,
    ).toBe(0);
    expect(checkConsistency(index, [held('a', { releases: [{ version: '1.0.0' }] })], {}).listingsDiffer).toBe(0);
  });

  it('finds packages the index archived that are held as available, and not those held as unavailable', () => {
    const archived = indexed('a', { archived: true });
    expect(checkConsistency([archived], [held('a')], {})).toMatchObject({
      listed: 0,
      archivedHeld: 1,
      concerned: [ref('a')],
    });
    expect(checkConsistency([archived], [held('a', { unavailable: 'archived', releases: [] })], {})).toMatchObject({
      archivedHeld: 0,
      concerned: [],
    });
    expect(checkConsistency([archived], [], {}).archivedHeld).toBe(0);
  });

  it('does not look in a package held as unavailable for what the index lists', () => {
    expect(
      checkConsistency(
        [indexed('a', { latestVersion: '2.0.0' })],
        [held('a', { unavailable: 'gone', releases: [] })],
        {},
      ),
    ).toEqual({ ...NONE, listed: 1, held: 1 });
  });

  it('finds packages whose own manifest gave a version not held, on the index or not', () => {
    const found = checkConsistency(
      [indexed('a')],
      [
        held('a', { ownVersion: '1.0.1' }),
        held('off', { ownVersion: 'v1.0.0' }),
        held('ahead', { ownVersion: '2.0.0' }),
        held('gone', { unavailable: 'gone', ownVersion: '9.0.0', releases: [] }),
      ],
      {},
    );
    expect(found).toMatchObject({ ownMissing: 2, concerned: [ref('a'), ref('ahead')] });
  });

  it('gives each package concerned once, though several things are wrong with it', () => {
    const found = checkConsistency(
      [indexed('a', { versions: [version('2.0.0'), version('3.0.0')], latestVersion: '3.0.0' })],
      [held('a', { ownVersion: '4.0.0' })],
      {},
    );
    expect(found).toMatchObject({ versionsMissing: 2, latestMissing: 1, ownMissing: 1, concerned: [ref('a')] });
  });
});
