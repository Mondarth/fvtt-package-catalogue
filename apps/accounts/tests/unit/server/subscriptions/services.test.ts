import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { SERVICE_ID, serviceIdOf } from '../../../../src/lib/service-id.js';
import { serviceTree, givenBy, reachedFrom } from '../../../../src/lib/server/subscriptions/services.js';
import {
  catalogueSettings,
  subscriptionServices,
  offerServices,
  subscriptionOffers,
} from '../../../../src/lib/server/subscriptions/schema.js';
import { subscriptionStore } from '../../../../src/lib/server/subscriptions/store.js';
import { testDatabase } from '../../support/pglite.js';

import type { Service } from '../../../../src/lib/server/subscriptions/services.js';
import type { Database } from '../../../../src/lib/server/db/database.js';

/** The tree the accounts begin with: Mondarth, over Apps, over the Catalogue and AIDE. */
const at = new Date('2026-11-27T00:00:00Z');
const START: Service[] = [
  ['mondarth', 'Mondarth', null],
  ['apps', 'Apps', 'mondarth'],
  ['catalogue', 'Catalogue', 'apps'],
  ['aide', 'AIDE', 'apps'],
].map(([id, name, parentId]) => ({
  id: id ?? '',
  name: name ?? '',
  description: null,
  parentId: parentId ?? null,
  createdBy: 'migration',
  createdAt: at,
  retiredAt: null,
  offers: 0,
}));

describe('a service', () => {
  it('takes its id from its name, if it is given none', () => {
    expect(serviceIdOf('AIDE beta')).toBe('aide-beta');
    expect(serviceIdOf('  Café — Pro!  ')).toBe('cafe-pro');
    expect(serviceIdOf('!!!')).toBe('');
    expect(serviceIdOf('x'.repeat(39) + ' y')).toBe('x'.repeat(39));
    expect(SERVICE_ID.test('aide-beta')).toBe(true);
    expect(SERVICE_ID.test('Aide')).toBe(false);
    expect(SERVICE_ID.test('aide--beta')).toBe(false);
  });

  it('is in a tree, under its parent, by name', () => {
    const tree = serviceTree(START);
    expect(tree.map(({ id }) => id)).toEqual(['mondarth']);
    const [apps] = tree[0]?.children ?? [];
    expect(apps?.id).toBe('apps');
    expect(apps?.children.map(({ id }) => id)).toEqual(['aide', 'catalogue']);
  });

  it('with access, gives itself and every one under it; wanted, is given by itself and every one above it', () => {
    expect(reachedFrom(START, 'apps')).toEqual(['apps', 'catalogue', 'aide']);
    expect(reachedFrom(START, 'catalogue')).toEqual(['catalogue']);
    expect(givenBy(START, 'catalogue')).toEqual(['catalogue', 'apps', 'mondarth']);
    expect(givenBy(START, 'mondarth')).toEqual(['mondarth']);
    expect(givenBy(START, 'unknown')).toEqual(['unknown']);
    // A loop, which the admins cannot make, ends.
    const loop = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(givenBy(loop, 'a')).toEqual(['a', 'b']);
  });
});

describe('the services stored', () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await testDatabase());
  });

  afterEach(() => close());

  it('begin as the migration made them, and Patreon subscribes to Apps', async () => {
    const store = subscriptionStore(db);
    const found = await store.services();
    expect(found.map(({ id, parentId, createdBy }) => [id, parentId, createdBy])).toEqual([
      ['aide', 'apps', 'migration'],
      ['apps', 'mondarth', 'migration'],
      ['catalogue', 'apps', 'migration'],
      ['mondarth', null, 'migration'],
    ]);
    const [patreon] = await db.select().from(catalogueSettings).where(eq(catalogueSettings.key, 'patreon_services'));
    expect(patreon?.value).toEqual(['apps']);
  });

  it('are added under another, or at the top, but not under one missing or retired, nor with an id taken', async () => {
    const store = subscriptionStore(db);
    const input = { description: 'The beta.', createdBy: 'admin' };
    const added = await store.addService({ ...input, id: 'aide-beta', name: 'AIDE beta', parentId: 'aide' });
    expect(added).toMatchObject({ id: 'aide-beta', parentId: 'aide', offers: 0, retiredAt: null });
    expect(await store.addService({ ...input, id: 'games', name: 'Games', parentId: null })).toMatchObject({
      parentId: null,
    });
    expect(await store.addService({ ...input, id: 'aide-beta', name: 'Again', parentId: null })).toBe('taken');
    expect(await store.addService({ ...input, id: 'x', name: 'X', parentId: 'nowhere' })).toBe('no-parent');
    await db.update(subscriptionServices).set({ retiredAt: at }).where(eq(subscriptionServices.id, 'games'));
    expect(await store.addService({ ...input, id: 'y', name: 'Y', parentId: 'games' })).toBe('no-parent');
    // Anything else the database refuses is thrown.
    await expect(
      store.addService({ ...input, id: 'z', name: null as unknown as string, parentId: null }),
    ).rejects.toThrow();
  });

  it('count the offers on sale that add time to each', async () => {
    const store = subscriptionStore(db);
    const offer = { months: 12, days: 0, prices: { GBP: 3000 }, createdBy: 'admin' };
    await db.insert(subscriptionOffers).values([
      { ...offer, id: 'o1', name: '12 months' },
      { ...offer, id: 'o2', name: 'Old', retiredAt: at },
    ]);
    await db.insert(offerServices).values([
      { offerId: 'o1', serviceId: 'catalogue' },
      { offerId: 'o2', serviceId: 'catalogue' },
      { offerId: 'o1', serviceId: 'aide' },
    ]);
    const counts = Object.fromEntries((await store.services()).map(({ id, offers }) => [id, offers]));
    expect(counts).toEqual({ aide: 1, apps: 0, catalogue: 1, mondarth: 0 });
  });
});
