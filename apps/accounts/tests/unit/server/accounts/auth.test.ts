import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AUTH_PATH,
  createAuth,
  providerApp,
  signInProviders,
  TEST_PROVIDER,
} from '../../../../src/lib/server/accounts/auth.js';
import { auditStore } from '../../../../src/lib/server/accounts/audit.js';
import { knownIdentitiesOf } from '../../../../src/lib/server/accounts/identities.js';
import { accounts, knownIdentities, users } from '../../../../src/lib/server/accounts/schema.js';
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
    expect(signInProviders({ patreon: github, discord: github, google: github, github })).toEqual([
      'github',
      'google',
      'discord',
      'patreon',
    ]);
  });
});

describe('providerApp', () => {
  it('is an app only with both its id and its secret', () => {
    expect(providerApp('id', 'secret')).toEqual({ clientId: 'id', clientSecret: 'secret' });
    expect(providerApp('id', undefined)).toBeUndefined();
    expect(providerApp(undefined, 'secret')).toBeUndefined();
  });
});

describe('createAuth', () => {
  it('answers under /auth, with GitHub and the stand-in provider where they are set up', () => {
    const auth = createAuth({
      db,
      audit: auditStore(db),
      secret: SECRET,
      siteUrl: 'https://catalogue.test',
      github,
      testProviderUrl: 'http://provider.test',
    });
    expect(auth.options.basePath).toBe(AUTH_PATH);
    expect(auth.options.socialProviders.github).toEqual(github);
    expect(auth.options.plugins.map(plugin => plugin.id)).toEqual([
      'generic-oauth',
      'admin',
      'bearer',
      'device-authorization',
    ]);
    expect(auth.options.account.encryptOAuthTokens).toBe(true);
  });

  it('offers Google and Discord as its own providers, and Patreon through its plugin', async () => {
    const google = { clientId: 'g-id', clientSecret: 'g-secret' };
    const discord = { clientId: 'd-id', clientSecret: 'd-secret' };
    const patreon = { clientId: 'p-id', clientSecret: 'p-secret' };
    const auth = createAuth({
      db,
      audit: auditStore(db),
      secret: SECRET,
      siteUrl: 'https://catalogue.test',
      google,
      discord,
      patreon,
    });
    expect(auth.options.socialProviders).toEqual({ google, discord });
    expect(auth.options.plugins.map(plugin => plugin.id)).toEqual([
      'generic-oauth',
      'admin',
      'bearer',
      'device-authorization',
    ]);
    const { socialProviders } = await auth.$context;
    expect(socialProviders.map(provider => provider.id).sort()).toEqual(['discord', 'google', 'patreon']);
  });

  it.each([
    ['github', 'github.com'],
    ['google', 'accounts.google.com'],
    ['discord', 'discord.com'],
    ['patreon', 'www.patreon.com'],
  ])('sends a sign-in with %s to it, to come back to /auth/callback/%s', async (provider, host) => {
    const app = { clientId: 'id', clientSecret: 'secret' };
    const auth = createAuth({
      db,
      audit: auditStore(db),
      secret: SECRET,
      siteUrl: 'https://catalogue.test',
      [provider]: app,
    });
    const { url } = await auth.api.signInSocial({ body: { provider, callbackURL: '/' } });
    const sent = new URL(url ?? '');
    expect(sent.host).toBe(host);
    expect(sent.searchParams.get('redirect_uri')).toBe(`https://catalogue.test/auth/callback/${provider}`);
  });

  it("shares its session cookie with every application's subdomain, where it has a domain, and trusts their origins", () => {
    const shared = createAuth({
      db,
      audit: auditStore(db),
      secret: SECRET,
      siteUrl: 'https://accounts.example.org',
      cookieDomain: 'example.org',
      appOrigins: ['https://catalogue.example.org'],
    });
    expect(shared.options.advanced).toEqual({ crossSubDomainCookies: { enabled: true, domain: 'example.org' } });
    expect(shared.options.trustedOrigins).toEqual(['https://catalogue.example.org']);
    const own = createAuth({ db, audit: auditStore(db), secret: SECRET, siteUrl: 'https://accounts.example.org' });
    expect(own.options.advanced).toBeUndefined();
    expect(own.options.trustedOrigins).toEqual([]);
  });

  it('offers no provider that is not set up', async () => {
    const auth = createAuth({ db, audit: auditStore(db), secret: SECRET, siteUrl: 'https://catalogue.test' });
    expect(auth.options.socialProviders).toEqual({});
    const { socialProviders } = await auth.$context;
    expect(socialProviders).toEqual([]);
  });

  it('gives each new user a handle no one else has', async () => {
    await db
      .insert(users)
      .values({ id: 'u0', name: 'Taken', email: 'taken@example.test', handle: 'amber-acorn-acorn-00' });
    // The first handle made is the one taken: then the next.
    let n = 0;
    const random = (bound: number) => (n++ < 4 ? 0 : 1) % bound;
    const auth = createAuth({ db, audit: auditStore(db), secret: SECRET, siteUrl: 'https://catalogue.test', random });
    const { internalAdapter } = await auth.$context;

    const user = await internalAdapter.createUser(
      { name: 'New', email: 'new@example.test', emailVerified: true },
      { method: 'oauth' },
    );

    expect(user).toMatchObject({ handle: 'ancient-anchor-anchor-01' });
  });

  it("remembers each profile's address and sign-in accounts as they are made, and all of them before it is deleted", async () => {
    const identities = knownIdentitiesOf(db, SECRET);
    const auth = createAuth({
      db,
      audit: auditStore(db),
      secret: SECRET,
      siteUrl: 'https://catalogue.test',
      identities,
    });
    const { internalAdapter } = await auth.$context;
    const kinds = async () =>
      (await db.select({ kind: knownIdentities.kind }).from(knownIdentities)).map(r => r.kind).sort();

    const user = await internalAdapter.createUser(
      { name: 'New', email: 'new@example.test', emailVerified: true },
      { method: 'oauth' },
    );
    expect(await kinds()).toEqual(['email']);
    await internalAdapter.linkAccount({ userId: user.id, providerId: 'github', accountId: '42' });
    expect(await kinds()).toEqual(['account', 'email']);

    // One made without Better Auth, as before identities were kept, is remembered as the profile goes, before Better
    // Auth deletes its sign-in accounts.
    await db.insert(accounts).values({ id: 'direct', providerId: 'discord', accountId: 'd1', userId: user.id });
    await auth.options.user.deleteUser.beforeDelete(user);
    expect(await kinds()).toEqual(['account', 'account', 'email']);
  });
});
