import { httpClient } from '@mondarth/fvtt-resolver/sources';
import { describe, expect, it, vi } from 'vitest';

import {
  CORS_HEADERS,
  createHandle,
  DEVICE_CORS_HEADERS,
  DEVICE_CORS_PATHS,
  rateLimiter,
} from '../../../../src/lib/server/http/handle.js';
import { fakeEvent } from '../../support/event.js';
import { memoryLogger } from '../../support/logger.js';
import { mockStore } from '../../support/store.js';

import type { RequestEvent } from '@sveltejs/kit';
import type { Accounts } from '@mondarth/accounts-contract';

import type { ApiUser } from '../../../../src/lib/server/http/handle.js';

const store = mockStore();

/** The client a request that fetches is given. */
const http = () => httpClient({ fetch: vi.fn<typeof fetch>() });

/** What fetches a URL a client gave. */
const fetchGiven = vi.fn(() => Promise.resolve({ ok: false, reason: 'refused' } as const));

/** The keys the tests' server accepts: one reaching every endpoint, and a module's. */
const KEYS = [
  { kind: 'full' as const, key: 'secret' },
  { kind: 'module' as const, key: 'modules-key' },
];

function setUp(more: { accounts?: Accounts; ratePerMinute?: number; now?: () => number } = {}) {
  const log = memoryLogger();
  let tick = 0;
  const handle = createHandle({
    store,
    apiKeys: KEYS,
    ...more,
    log,
    http,
    fetchGiven,
    requestId: () => 'id-1',
    clock: () => (tick += 5),
  });
  const resolve = vi.fn<(event: RequestEvent) => Promise<Response>>(() => Promise.resolve(Response.json({ ok: true })));
  const run = (url: string, options: { method?: string; headers?: Record<string, string> } = {}) => {
    const event = fakeEvent({ url: `http://catalogue.test${url}`, ...options });
    return { event, response: Promise.resolve(handle({ event, resolve })) };
  };
  return { log, resolve, run };
}

describe('createHandle', () => {
  it('gives every request an id, the store, a logger and the client to fetch with', async () => {
    const { run } = setUp();
    const { event, response } = run('/');
    await response;
    expect(event.locals.requestId).toBe('id-1');
    expect(event.locals.store).toBe(store);
    expect(event.locals.http).toBe(http);
    expect(event.locals.fetchGiven).toBe(fetchGiven);
  });

  it('logs each request once, with its id, status and time', async () => {
    const { log, run } = setUp();
    await run('/api/v2/status', { headers: { 'X-API-Key': 'secret', 'X-Catalogue-Client': 'EMMA/0.6.0' } }).response;
    expect(log.lines).toEqual([
      expect.objectContaining({
        message: 'request',
        requestId: 'id-1',
        method: 'GET',
        path: '/api/v2/status',
        status: 200,
        ms: 5,
        client: 'EMMA/0.6.0',
      }),
    ]);
  });

  it('serves the website without a key or CORS headers', async () => {
    const { resolve, run } = setUp();
    const response = await run('/').response;
    expect(resolve).toHaveBeenCalledOnce();
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  describe("a device's sign-in endpoints", () => {
    const headersOf = (response: Response) =>
      Object.fromEntries([...response.headers].filter(([name]) => name.startsWith('access-control-')));
    const expected = Object.fromEntries(
      Object.entries(DEVICE_CORS_HEADERS).map(([name, value]) => [name.toLowerCase(), value]),
    );

    it('are the code and the token alone', () => {
      expect([...DEVICE_CORS_PATHS].sort()).toEqual(['/auth/device/code', '/auth/device/token']);
    });

    it.each([...DEVICE_CORS_PATHS])('answer the preflight of %s without Better Auth', async path => {
      const { resolve, run } = setUp();
      const response = await run(path, { method: 'OPTIONS' }).response;
      expect(response.status).toBe(204);
      expect(headersOf(response)).toEqual(expected);
      expect(resolve).not.toHaveBeenCalled();
    });

    it.each([...DEVICE_CORS_PATHS])('let any origin read what Better Auth answers %s, without a key', async path => {
      const { resolve, run } = setUp();
      const response = await run(path, { method: 'POST', headers: { Origin: 'chrome-extension://emma' } }).response;
      expect(resolve).toHaveBeenCalledOnce();
      expect(response.status).toBe(200);
      expect(headersOf(response)).toEqual(expected);
    });

    it('allow no credentials, nor any header but the type of a JSON body', () => {
      expect(DEVICE_CORS_HEADERS).not.toHaveProperty('Access-Control-Allow-Credentials');
      expect(DEVICE_CORS_HEADERS['Access-Control-Allow-Headers']).toBe('Content-Type');
      expect(DEVICE_CORS_HEADERS['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    });

    it.each(['/auth/device', '/auth/device/approve', '/auth/sign-out', '/auth/get-session'])(
      'leave %s, which the website calls, without CORS headers',
      async path => {
        const { run } = setUp();
        const response = await run(path, { method: 'POST' }).response;
        expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
      },
    );
  });

  it('answers the CORS preflight without a key', async () => {
    const { resolve, run } = setUp();
    const response = await run('/api/v2/status', { method: 'OPTIONS' }).response;
    expect(response.status).toBe(204);
    expect(Object.fromEntries(response.headers)).toMatchObject(
      Object.fromEntries(Object.entries(CORS_HEADERS).map(([name, value]) => [name.toLowerCase(), value])),
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it('lets other origins post, as the universe is asked for', () => {
    expect(CORS_HEADERS['Access-Control-Allow-Methods']?.split(', ')).toEqual(['GET', 'POST', 'OPTIONS']);
  });

  it.each([
    ['no key', {}],
    ['an empty key', { 'X-API-Key': '' }],
    ['a wrong key', { 'X-API-Key': 'guess' }],
  ])('refuses an API request with %s, readably from any origin', async (_label, headers) => {
    const { resolve, run } = setUp();
    const response = await run('/api/v2/status', { headers }).response;
    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({
      error: { code: 'unauthorised', message: 'A valid X-API-Key header is needed', requestId: 'id-1' },
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('serves an API request with a key, with CORS headers', async () => {
    const { run } = setUp();
    const response = await run('/api/v2/status', { headers: { 'X-API-Key': 'secret' } }).response;
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('treats only paths under /api as the API', async () => {
    const { resolve, run } = setUp();
    const response = await run('/apis').response;
    expect(response.status).toBe(200);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it('checks the key of every version of the API', async () => {
    const { resolve, run } = setUp();
    expect((await run('/api/v2/lookup', { method: 'POST' }).response).status).toBe(401);
    expect((await run('/api/v9/nothing').response).status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });

  // Regression: SvelteKit answered an API path no route matches with its HTML error page.
  it.each([
    [404, 'not-found'],
    [405, 'method-not-allowed'],
    [410, 'bad-request'],
    [500, 'internal'],
    [503, 'internal'],
  ])("answers SvelteKit's own %i under the API in the contract's shape", async (status, code) => {
    const { resolve, run } = setUp();
    resolve.mockResolvedValueOnce(
      new Response('<!doctype html>', { status, headers: { 'Content-Type': 'text/html' } }),
    );
    const response = await run('/api/v2/nope', { headers: { 'X-API-Key': 'secret' } }).response;
    expect(response.status).toBe({ 410: 400, 503: 500 }[status] ?? status);
    expect(await response.json()).toMatchObject({ error: { code, requestId: 'id-1' } });
  });

  it('passes a 304 through as it is, with the CORS headers, and lets a client revalidate and read the ETag', async () => {
    const { resolve, run } = setUp();
    resolve.mockResolvedValueOnce(new Response(null, { status: 304, headers: { ETag: '"a"' } }));
    const response = await run('/api/v2/listing', { headers: { 'X-API-Key': 'secret' } }).response;
    expect(response.status).toBe(304);
    expect(response.headers.get('ETag')).toBe('"a"');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(CORS_HEADERS['Access-Control-Allow-Headers']).toContain('If-None-Match');
    expect(CORS_HEADERS['Access-Control-Expose-Headers']).toBe('ETag');
  });

  it('makes a new random id for each request by default', async () => {
    const handle = createHandle({ store, apiKeys: KEYS, log: memoryLogger(), http, fetchGiven });
    const ids = await Promise.all(
      [1, 2].map(async () => {
        const event = fakeEvent();
        await handle({ event, resolve: () => Promise.resolve(new Response()) });
        return event.locals.requestId;
      }),
    );
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe('who may call what', () => {
  const until = new Date('2027-01-01T00:00:00Z');
  const USER: ApiUser = { id: 'u1', handle: 'amber-fox-oak-01', nickname: null, role: 'user', impersonated: false };

  /** The accounts, by users' tokens: `subscribed`, `lapsed`, `admin` and `viewed` (a session an admin views the site as them in). */
  function users() {
    const found: Record<string, ApiUser> = {
      subscribed: USER,
      lapsed: { ...USER, id: 'u2' },
      admin: { ...USER, id: 'u3', role: 'admin' },
      viewed: { ...USER, impersonated: true },
      never: { ...USER, id: 'u4' },
      withSession: { ...USER, id: 'u5', sessionId: 'session-5' },
    };
    const userOf = vi.fn<Accounts['userOf']>(token => Promise.resolve(found[token]));
    return {
      userOf,
      used: vi.fn<Accounts['used']>(() => Promise.resolve()),
      entitlement: (user: ApiUser) =>
        Promise.resolve(
          user.id === 'u2'
            ? { paidUntil: new Date('2026-11-01T00:00:00Z'), active: false, patreon: false, entitled: false }
            : user.id === 'u4'
              ? { paidUntil: null, active: false, patreon: false, entitled: false }
              : { paidUntil: until, active: user.id === 'u1', patreon: false, entitled: true },
        ),
    };
  }

  it("lets a module's key call lookups", async () => {
    const { run } = setUp();
    expect((await run('/api/v2/lookup', { headers: { 'X-API-Key': 'modules-key' } }).response).status).toBe(200);
  });

  it.each(['/api/v2/listing', '/api/v2/core', '/api/v2/manifest', '/api/v2/recheck', '/api/v2/status', '/api/v2/me'])(
    "refuses a module's key %s, as forbidden",
    async path => {
      const { resolve, run } = setUp();
      const response = await run(path, { headers: { 'X-API-Key': 'modules-key' } }).response;
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: 'forbidden' } });
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it('lets a key alone call every endpoint but /me', async () => {
    const { run } = setUp();
    expect((await run('/api/v2/recheck', { headers: { 'X-API-Key': 'secret' } }).response).status).toBe(200);
    expect((await run('/api/v2/me', { headers: { 'X-API-Key': 'secret' } }).response).status).toBe(403);
  });

  it('gives the endpoint who is asking', async () => {
    const { run } = setUp({ accounts: users() });
    const byKey = run('/api/v2/lookup', { headers: { 'X-API-Key': 'modules-key' } });
    await byKey.response;
    expect(byKey.event.locals.caller).toEqual({ kind: 'module' });
    const byToken = run('/api/v2/lookup', { headers: { Authorization: 'Bearer subscribed' } });
    await byToken.response;
    expect(byToken.event.locals.caller).toMatchObject({ kind: 'user', user: USER, entitlement: { entitled: true } });
  });

  it("tells the accounts of a signed-in user's use of the API, but not of a key's", async () => {
    const accounts = users();
    const { run } = setUp({ accounts });
    await run('/api/v2/lookup', {
      headers: {
        Authorization: 'Bearer subscribed',
        'X-Catalogue-Client': 'EMMA-extension/0.13.1',
        'User-Agent': 'Firefox/140.0',
      },
    }).response;
    expect(accounts.used).toHaveBeenCalledWith(USER, {
      kind: 'api',
      path: '/api/v2/lookup',
      client: 'EMMA-extension/0.13.1',
      ipAddress: null,
      userAgent: 'Firefox/140.0',
    });
    accounts.used.mockClear();
    await run('/api/v2/me', { headers: { Authorization: 'Bearer lapsed' } }).response;
    expect(accounts.used).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u2' }),
      expect.objectContaining({ client: 'api', userAgent: null }),
    );
    accounts.used.mockClear();
    // A key is no user's; a session an admin views the site in is refused before it.
    await run('/api/v2/lookup', { headers: { 'X-API-Key': 'modules-key' } }).response;
    await run('/api/v2/lookup', { headers: { Authorization: 'Bearer viewed' } }).response;
    expect(accounts.used).not.toHaveBeenCalled();
  });

  it("lets a subscribed user's token, or an admin's, call every endpoint", async () => {
    const { run } = setUp({ accounts: users() });
    for (const token of ['subscribed', 'admin']) {
      expect((await run('/api/v2/recheck', { headers: { Authorization: `Bearer ${token}` } }).response).status).toBe(
        200,
      );
    }
  });

  it("refuses a lapsed user's token all but /me, saying when the subscription ended", async () => {
    const { run } = setUp({ accounts: users() });
    const response = await run('/api/v2/lookup', { headers: { Authorization: 'Bearer lapsed' } }).response;
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'subscription-required',
        message: 'A subscription is needed',
        requestId: 'id-1',
        paidUntil: '2026-11-01T00:00:00.000Z',
      },
    });
    expect((await run('/api/v2/me', { headers: { Authorization: 'Bearer lapsed' } }).response).status).toBe(200);
  });

  it('says a user who never subscribed has no end to give', async () => {
    const { run } = setUp({ accounts: users() });
    const response = await run('/api/v2/lookup', { headers: { Authorization: 'Bearer never' } }).response;
    expect(await response.json()).toMatchObject({ error: { code: 'subscription-required', paidUntil: null } });
  });

  it('refuses the token of a session an admin is viewing the site in', async () => {
    const { run } = setUp({ accounts: users() });
    const response = await run('/api/v2/me', { headers: { Authorization: 'Bearer viewed' } }).response;
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'forbidden' } });
  });

  it.each([
    ['a token no session has', 'Bearer unknown'],
    ['another scheme', 'Basic dXNlcjpwYXNz'],
    ['no token', 'Bearer '],
  ])('refuses %s, a key besides or not', async (_label, authorization) => {
    const { run } = setUp({ accounts: users() });
    const response = await run('/api/v2/lookup', {
      headers: { Authorization: authorization, 'X-API-Key': 'secret' },
    }).response;
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'unauthorised' } });
  });

  it("refuses a user's token where tokens are not known", async () => {
    const { run } = setUp();
    expect((await run('/api/v2/lookup', { headers: { Authorization: 'Bearer subscribed' } }).response).status).toBe(
      401,
    );
  });

  it('never reads the session cookie', async () => {
    const known = users();
    const { run } = setUp({ accounts: known });
    const response = await run('/api/v2/lookup', { headers: { Cookie: 'better-auth.session_token=subscribed' } })
      .response;
    expect(response.status).toBe(401);
    expect(known.userOf).not.toHaveBeenCalled();
  });

  it('limits how often each key or user may ask in a minute, answering the rest as rate-limited', async () => {
    let time = 0;
    const { run } = setUp({ accounts: users(), ratePerMinute: 2, now: () => time });
    const ask = (headers: Record<string, string>) => run('/api/v2/lookup', { headers }).response;
    expect((await ask({ 'X-API-Key': 'secret' })).status).toBe(200);
    expect((await ask({ 'X-API-Key': 'secret' })).status).toBe(200);
    const limited = await ask({ 'X-API-Key': 'secret' });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: 'rate-limited' } });
    // Each key and user apart.
    expect((await ask({ 'X-API-Key': 'modules-key' })).status).toBe(200);
    expect((await ask({ Authorization: 'Bearer subscribed' })).status).toBe(200);
    time += 60_000;
    expect((await ask({ 'X-API-Key': 'secret' })).status).toBe(200);
  });

  it('allows a key 300 requests a minute by default', async () => {
    // A minute that does not end, so that the requests cannot straddle two.
    const { run } = setUp({ now: () => 0 });
    const statuses = [];
    for (let made = 0; made < 301; made++) {
      statuses.push((await run('/api/v2/lookup', { headers: { 'X-API-Key': 'secret' } }).response).status);
    }
    expect(statuses.filter(status => status === 200)).toHaveLength(300);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('rateLimiter', () => {
  it('starts each minute afresh, and reads the time now by default', () => {
    const allowed = rateLimiter(1, () => 0);
    expect(allowed('a')).toBe(true);
    expect(allowed('a')).toBe(false);
    expect(rateLimiter(1, Date.now)('a')).toBe(true);
  });
});
