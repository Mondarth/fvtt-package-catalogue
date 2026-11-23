import { describe, expect, it, vi } from 'vitest';

import { AccountsUnavailable, httpAccounts } from '../src/client.js';
import { INTERNAL_KEY_HEADER, INTERNAL_PATHS } from '../src/index.js';
import { internalApi } from '../src/server.js';

import type { Accounts, AccountUser } from '../src/index.js';

const USER: AccountUser = {
  id: 'u1',
  handle: 'amber-fox-oak-01',
  nickname: 'Ulenar',
  role: 'user',
  impersonated: false,
  sessionId: 's1',
};
const ENTITLEMENT = { paidUntil: new Date('2027-01-01T00:00:00.000Z'), active: true, patreon: false, entitled: true };
const USE = {
  kind: 'api',
  path: '/api/v2/lookup',
  client: 'EMMA-extension/0.13.1',
  ipAddress: null,
  userAgent: null,
} as const;

/** The accounts behind the API: the token `t1`, and the cookie `session=c1`, are the user's. */
function served() {
  const accounts = {
    userOf: vi.fn<Accounts['userOf']>(token => Promise.resolve(token === 't1' ? USER : undefined)),
    userOfSession: vi.fn<Accounts['userOfSession']>(cookie =>
      Promise.resolve(cookie.includes('session=c1') ? USER : undefined),
    ),
    entitlement: vi.fn<Accounts['entitlement']>(() => Promise.resolve(ENTITLEMENT)),
    used: vi.fn<Accounts['used']>(() => Promise.resolve()),
  };
  const handle = internalApi(accounts, { keys: ['old-key', 'app-key'] });
  const fetching = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    handle(new Request(input instanceof Request ? input : String(input), init)),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  return { accounts, handle, fetching };
}

/** A request to the API, as an application would make one. */
const call = (path: string, body: unknown, { key = 'app-key', method = 'POST' } = {}) =>
  new Request(`http://accounts${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', [INTERNAL_KEY_HEADER]: key },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });

describe('the internal API, through its client', () => {
  it('tells who a token, or the cookies, are for, or that they are no one', async () => {
    const { fetching } = served();
    const accounts = httpAccounts({ url: 'http://accounts:3000', key: 'app-key', fetch: fetching });
    expect(await accounts.userOf('t1')).toEqual(USER);
    expect(await accounts.userOf('other')).toBeUndefined();
    expect(await accounts.userOfSession('theme=dark; session=c1')).toEqual(USER);
    expect(await accounts.userOfSession('')).toBeUndefined();
  });

  it('tells what a user is entitled to, the time read back as a date', async () => {
    const { fetching, accounts: behind } = served();
    const accounts = httpAccounts({ url: 'http://accounts:3000', key: 'app-key', fetch: fetching });
    expect(await accounts.entitlement(USER)).toEqual(ENTITLEMENT);
    expect(behind.entitlement).toHaveBeenCalledWith(USER);
  });

  it("tells of a user's use of the service, every time", async () => {
    const { fetching, accounts: behind } = served();
    const accounts = httpAccounts({ url: 'http://accounts:3000', key: 'app-key', fetch: fetching });
    await accounts.used(USER, USE);
    await accounts.used(USER, USE);
    expect(behind.used).toHaveBeenCalledTimes(2);
    expect(behind.used).toHaveBeenCalledWith(USER, USE);
  });

  it('keeps who and what a minute, by what was asked, and asks again after', async () => {
    const { fetching, accounts: behind } = served();
    let now = 0;
    const accounts = httpAccounts({ url: 'http://accounts:3000', key: 'app-key', fetch: fetching, clock: () => now });
    await accounts.userOf('t1');
    await accounts.userOf('t1');
    await accounts.entitlement(USER);
    await accounts.entitlement(USER);
    await accounts.entitlement({ ...USER, role: 'admin' });
    expect(behind.userOf).toHaveBeenCalledTimes(1);
    expect(behind.entitlement).toHaveBeenCalledTimes(2);
    now += 60_000;
    await accounts.userOf('t1');
    expect(behind.userOf).toHaveBeenCalledTimes(2);
  });

  it('keeps no failed answer, and forgets the oldest beyond those it keeps', async () => {
    const { fetching, accounts: behind } = served();
    behind.userOf.mockRejectedValueOnce(new Error('down'));
    const accounts = httpAccounts({ url: 'http://accounts:3000', key: 'app-key', fetch: fetching });
    await expect(accounts.userOf('t1')).rejects.toBeInstanceOf(AccountsUnavailable);
    expect(await accounts.userOf('t1')).toEqual(USER);
    for (let index = 0; index <= 10_000; index++) await accounts.userOf(`token-${String(index)}`);
    behind.userOf.mockClear();
    // `t1` was the oldest, and is asked again; the newest is not.
    await accounts.userOf('t1');
    await accounts.userOf('token-10000');
    expect(behind.userOf).toHaveBeenCalledExactlyOnceWith('t1');
  });

  it('throws, as unavailable, when the accounts cannot be reached, refuse, or answer what it cannot read', async () => {
    const unreachable = httpAccounts({
      url: 'http://accounts:3000',
      key: 'app-key',
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    await expect(unreachable.userOf('t1')).rejects.toThrow('could not be reached at http://accounts:3000');

    const { fetching } = served();
    const wrongKey = httpAccounts({ url: 'http://accounts:3000', key: 'wrong', fetch: fetching });
    await expect(wrongKey.used(USER, USE)).rejects.toThrow('answered 401');

    const unreadable = httpAccounts({
      url: 'http://accounts:3000',
      key: 'app-key',
      fetch: () => Promise.resolve(new Response('not json')),
    });
    await expect(unreadable.entitlement(USER)).rejects.toThrow('could not be read');
    const unexpected = httpAccounts({
      url: 'http://accounts:3000',
      key: 'app-key',
      fetch: () => Promise.resolve(Response.json({ user: { id: 1 } })),
    });
    await expect(unexpected.userOf('t1')).rejects.toBeInstanceOf(AccountsUnavailable);
  });

  it('uses the global fetch and clock by default', async () => {
    const { handle } = served();
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => handle(new Request(input, init)));
    try {
      expect(await httpAccounts({ url: 'http://accounts:3000', key: 'app-key' }).userOf('t1')).toEqual(USER);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('the internal API, as served', () => {
  it('refuses a request without a key it knows, before anything else', async () => {
    const { handle } = served();
    for (const key of ['', 'app-ke', 'app-keyy', 'wrong-key']) {
      expect((await handle(call(INTERNAL_PATHS.tokenUser, { token: 't1' }, { key }))).status).toBe(401);
    }
    expect((await handle(call('/internal/v1/nothing', {}, { key: 'x' }))).status).toBe(401);
    const keyless = new Request(`http://accounts${INTERNAL_PATHS.tokenUser}`, {
      method: 'POST',
      body: '{"token":"t1"}',
    });
    expect((await handle(keyless)).status).toBe(401);
    // Either key, while one is rotated.
    expect((await handle(call(INTERNAL_PATHS.tokenUser, { token: 't1' }, { key: 'old-key' }))).status).toBe(200);
  });

  it('knows its own endpoints alone, each by POST', async () => {
    const { handle } = served();
    const missing = await handle(call('/internal/v1/nothing', {}));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not-found' });
    expect((await handle(call(INTERNAL_PATHS.tokenUser, null, { method: 'GET' }))).status).toBe(405);
  });

  it.each(Object.values(INTERNAL_PATHS))('refuses at %s what is not its request, as a bad request', async path => {
    const { handle, accounts } = served();
    expect((await handle(call(path, 'not json'))).status).toBe(400);
    expect((await handle(call(path, { nothing: true }))).status).toBe(400);
    for (const method of Object.values(accounts)) expect(method).not.toHaveBeenCalled();
  });

  it('answers a use with no content', async () => {
    const { handle } = served();
    const response = await handle(call(INTERNAL_PATHS.use, { user: USER, use: USE }));
    expect(response.status).toBe(204);
  });

  it('is never served without a key', () => {
    expect(() => internalApi(served().accounts, { keys: [] })).toThrow('at least one key');
  });
});
