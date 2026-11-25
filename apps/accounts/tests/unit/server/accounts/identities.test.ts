import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import {
  accountIdentity,
  emailIdentity,
  identityHasher,
  knownIdentitiesOf,
} from '../../../../src/lib/server/accounts/identities.js';
import { accounts, knownIdentities, users } from '../../../../src/lib/server/accounts/schema.js';
import { testDatabase } from '../../support/pglite.js';

import type { Database } from '../../../../src/lib/server/db/database.js';

const SECRET = 'a-test-secret-a-test-secret-a-test-secret';
const at = (iso: string) => new Date(iso);

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await testDatabase());
  await db.insert(users).values([
    { id: 'u1', name: 'One', email: 'One@Example.test', handle: 'amber-fox-oak-01' },
    { id: 'u2', name: 'Two', email: 'two@example.test', handle: 'bold-owl-elm-02' },
  ]);
  await db.insert(accounts).values({ id: 'a1', providerId: 'github', accountId: '42', userId: 'u1' });
});

afterEach(() => close());

describe('hashing identities', () => {
  it('is keyed, one-way and stable, an address however it is written', () => {
    const hash = identityHasher(SECRET);
    expect(hash(emailIdentity(' One@Example.TEST '))).toBe(hash(emailIdentity('one@example.test')));
    expect(hash(emailIdentity('one@example.test'))).toMatch(/^[0-9a-f]{64}$/);
    expect(hash(emailIdentity('one@example.test'))).not.toContain('example');
    // Another key, another hash; an address and an account apart, whatever their text.
    expect(identityHasher(`${SECRET}!`)(emailIdentity('one@example.test'))).not.toBe(
      hash(emailIdentity('one@example.test')),
    );
    expect(hash({ kind: 'email', value: 'github:42' })).not.toBe(hash(accountIdentity('github', '42')));
  });
});

describe('the known identities', () => {
  it("remember a user's address and sign-in accounts, once each, and nothing for no one", async () => {
    const identities = knownIdentitiesOf(db, SECRET);
    const hashes = await identities.remember('u1', at('2026-11-20T00:00:00Z'));
    expect(hashes).toHaveLength(2);
    await identities.remember('u1', at('2026-11-21T00:00:00Z'));
    const rows = await db.select().from(knownIdentities);
    expect(rows.map(row => row.kind).sort()).toEqual(['account', 'email']);
    // First seen as first remembered.
    expect(rows.every(row => row.firstSeenAt.getTime() === at('2026-11-20T00:00:00Z').getTime())).toBe(true);
    expect(await identities.remember('nobody')).toEqual([]);
    expect(await identities.rememberThese([])).toEqual([]);
  });

  it('outlive the user, so that one made again by the same address stands where the first did', async () => {
    const identities = knownIdentitiesOf(db, SECRET);
    await identities.claimIntroductory('u1');
    await identities.refusePurchases('u1', at('2026-11-22T00:00:00Z'));
    await db.delete(users).where(eq(users.id, 'u1'));
    await db.insert(users).values({ id: 'u3', name: 'Again', email: 'one@example.test', handle: 'calm-elk-ash-03' });
    expect(await identities.standing('u3')).toEqual({
      introductoryClaimed: true,
      purchasesRefusedAt: at('2026-11-22T00:00:00Z'),
    });
    // Another person stands clear.
    expect(await identities.standing('u2')).toEqual({ introductoryClaimed: false, purchasesRefusedAt: null });
  });

  it('know a user by a sign-in account another profile had, whatever its address', async () => {
    const identities = knownIdentitiesOf(db, SECRET);
    await identities.refusePurchases('u1', at('2026-11-22T00:00:00Z'));
    await db.delete(users).where(eq(users.id, 'u1'));
    await db.insert(accounts).values({ id: 'a2', providerId: 'github', accountId: '42', userId: 'u2' });
    expect((await identities.standing('u2')).purchasesRefusedAt).toEqual(at('2026-11-22T00:00:00Z'));
  });

  it('allow purchases again, as an admin decides, and give the first refusal of several', async () => {
    const identities = knownIdentitiesOf(db, SECRET);
    await identities.refusePurchases('u2', at('2026-11-21T00:00:00Z'));
    await identities.refusePurchases('u1', at('2026-11-22T00:00:00Z'));
    // u2 goes, and u1 takes their address, refused a day before u1's own sign-in.
    await db.delete(users).where(eq(users.id, 'u2'));
    await db.update(users).set({ email: 'two@example.test' }).where(eq(users.id, 'u1'));
    expect((await identities.standing('u1')).purchasesRefusedAt).toEqual(at('2026-11-21T00:00:00Z'));
    await identities.allowPurchases('u1');
    expect((await identities.standing('u1')).purchasesRefusedAt).toBeNull();
  });

  it('stand no one clear who is not there, and mark nothing for them', async () => {
    const identities = knownIdentitiesOf(db, SECRET);
    expect(await identities.standing('nobody')).toEqual({ introductoryClaimed: false, purchasesRefusedAt: null });
    await identities.claimIntroductory('nobody');
    expect(await db.select().from(knownIdentities)).toEqual([]);
  });
});
