import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AUTH_PATH, createAuth, signInProviders, TEST_PROVIDER } from '../../../../src/lib/server/accounts/auth.js';
import { users } from '../../../../src/lib/server/accounts/schema.js';
import { testDatabase } from '../../support/pglite.js';

import type { Database } from '../../../../src/lib/server/db/database.js';

const SECRET = 'a-test-secret-a-test-secret-a-test-secret';
const github = { clientId: 'id', clientSecret: 'secret' };

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await testDatabase());
});

afterEach(() => close());

describe('signInProviders', () => {
  it('offers each provider set up, and no other', () => {
    expect(signInProviders({})).toEqual([]);
    expect(signInProviders({ github })).toEqual(['github']);
    expect(signInProviders({ github, testProviderUrl: 'http://provider.test' })).toEqual(['github', TEST_PROVIDER]);
  });
});

describe('createAuth', () => {
  it('answers under /auth, with GitHub and the stand-in provider where they are set up', () => {
    const auth = createAuth({
      db,
      secret: SECRET,
      siteUrl: 'https://catalogue.test',
      github,
      testProviderUrl: 'http://provider.test',
    });
    expect(auth.options.basePath).toBe(AUTH_PATH);
    expect(auth.options.socialProviders.github).toEqual(github);
    expect(auth.options.plugins.map(plugin => plugin.id)).toEqual(['generic-oauth']);
    expect(auth.options.account.encryptOAuthTokens).toBe(true);
  });

  it('offers no provider that is not set up', () => {
    const auth = createAuth({ db, secret: SECRET, siteUrl: 'https://catalogue.test' });
    expect(auth.options.socialProviders).toEqual({});
    expect(auth.options.plugins).toEqual([]);
  });

  it('gives each new user a handle no one else has', async () => {
    await db
      .insert(users)
      .values({ id: 'u0', name: 'Taken', email: 'taken@example.test', handle: 'amber-acorn-acorn-00' });
    // The first handle made is the one taken: then the next.
    let n = 0;
    const random = (bound: number) => (n++ < 4 ? 0 : 1) % bound;
    const auth = createAuth({ db, secret: SECRET, siteUrl: 'https://catalogue.test', random });
    const { internalAdapter } = await auth.$context;

    const user = await internalAdapter.createUser(
      { name: 'New', email: 'new@example.test', emailVerified: true },
      { method: 'oauth' },
    );

    expect(user).toMatchObject({ handle: 'ancient-anchor-anchor-01' });
  });
});
