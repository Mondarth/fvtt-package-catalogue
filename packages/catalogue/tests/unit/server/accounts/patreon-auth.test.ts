import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditStore } from '../../../../src/lib/server/accounts/audit.js';
import { createAuth, patreonProvider } from '../../../../src/lib/server/accounts/auth.js';
import { accounts, users } from '../../../../src/lib/server/accounts/schema.js';
import { patreonMemberships } from '../../../../src/lib/server/subscriptions/schema.js';
import { testDatabase } from '../../support/pglite.js';

import type { Auth } from '../../../../src/lib/server/accounts/auth.js';
import type { Database } from '../../../../src/lib/server/db/database.js';

const SECRET = 'a-test-secret-a-test-secret-a-test-secret';
const APP = { clientId: 'p-id', clientSecret: 'p-secret' };

describe('patreonProvider', () => {
  it("asks for the user's memberships, at Patreon's address or a stand-in's", () => {
    const own = patreonProvider(APP);
    expect(own).toMatchObject({
      providerId: 'patreon',
      clientId: 'p-id',
      authorizationUrl: 'https://www.patreon.com/oauth2/authorize',
      tokenUrl: 'https://www.patreon.com/api/oauth2/token',
      scopes: ['identity', 'identity[email]', 'identity.memberships'],
    });
    expect(patreonProvider(APP, 'http://127.0.0.1:4174')).toMatchObject({
      authorizationUrl: 'http://127.0.0.1:4174/oauth2/authorize',
      tokenUrl: 'http://127.0.0.1:4174/api/oauth2/token',
    });
  });

  it('reads who the user is from Patreon', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        Response.json({
          data: {
            id: 'p-ada',
            attributes: {
              email: 'ada@example.test',
              full_name: 'Ada',
              image_url: 'https://x.test/a.png',
              is_email_verified: true,
            },
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const provider = patreonProvider(APP, 'http://stand-in.test');
    expect(await provider.getUserInfo({ accessToken: 't0k3n' })).toEqual({
      id: 'p-ada',
      name: 'Ada',
      email: 'ada@example.test',
      image: 'https://x.test/a.png',
      emailVerified: true,
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url instanceof URL ? url.href : url).toBe(
      'http://stand-in.test/api/oauth2/v2/identity?fields%5Buser%5D=email%2Cfull_name%2Cimage_url%2Cis_email_verified',
    );
    expect(init).toEqual({ headers: { authorization: 'Bearer t0k3n' } });
  });

  it('gives what Patreon leaves out as empty, and no one for a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ data: { id: 'p-bob', attributes: {} } }))),
    );
    expect(await patreonProvider(APP).getUserInfo({})).toEqual({
      id: 'p-bob',
      name: '',
      email: undefined,
      image: undefined,
      emailVerified: false,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 401 }))),
    );
    expect(await patreonProvider(APP).getUserInfo({ accessToken: 'x' })).toBeNull();
  });
});

describe("Better Auth's accounts, with Patreon", () => {
  let db: Database;
  let close: () => Promise<void>;
  let auth: Auth;

  beforeEach(async () => {
    ({ db, close } = await testDatabase());
    auth = createAuth({ db, audit: auditStore(db), secret: SECRET, siteUrl: 'https://catalogue.test', patreon: APP });
    await db.insert(users).values({ id: 'ada', name: 'Ada', email: 'ada@example.test', handle: 'handle-ada' });
  });

  afterEach(() => close());

  /** What Patreon last said of Ada, kept. */
  const keepMembership = () =>
    db.insert(patreonMemberships).values({ userId: 'ada', askedAt: new Date(), checkedAt: new Date() });
  const kept = async () => (await db.select().from(patreonMemberships)).length;

  it('links accounts only as a user asks, whatever their email, Patreon trusted to say whose', async () => {
    const { options } = await auth.$context;
    expect(options.account.accountLinking).toEqual({
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: true,
      trustedProviders: ['patreon'],
    });
  });

  it('forgets what Patreon said as a Patreon account is linked, and unlinked', async () => {
    const ctx = await auth.$context;
    await keepMembership();
    const linked = await ctx.internalAdapter.linkAccount({ userId: 'ada', providerId: 'patreon', accountId: 'p-ada' });
    expect(await kept()).toBe(0);
    await keepMembership();
    await ctx.internalAdapter.linkAccount({ userId: 'ada', providerId: 'github', accountId: 'g-ada' });
    expect(await kept()).toBe(1);
    await ctx.internalAdapter.deleteAccount(linked.id);
    expect(await kept()).toBe(0);
  });

  it('forgets it as Patreon is signed in with or linked again, never as its token is refreshed', async () => {
    const ctx = await auth.$context;
    const after = ctx.options.databaseHooks.account.update.after;
    const account = { providerId: 'patreon', userId: 'ada' } as never;
    for (const [path, forgets] of [
      ['/get-access-token', false],
      ['/refresh-token', false],
      ['/callback/patreon', true],
      ['/oauth2/callback/patreon', true],
      [undefined, true],
    ] as const) {
      await db.delete(patreonMemberships);
      await keepMembership();
      await after(account, (path === undefined ? undefined : { path }) as never);
      expect(await kept(), String(path)).toBe(forgets ? 0 : 1);
    }
    expect(await db.select().from(accounts)).toEqual([]);
  });
});
