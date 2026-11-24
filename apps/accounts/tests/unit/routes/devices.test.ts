import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { actions, load } from '../../../src/routes/profile/+page.server.js';
import { fakeEvent } from '../support/event.js';

import type { Auth } from '../../../src/lib/server/accounts/auth.js';
import type { AccountsStore } from '../../../src/lib/server/accounts/store.js';
import type { Device } from '../../../src/routes/profile/+page.server.js';

const USER = { id: 'ada', handle: 'handle-ada', nickname: null, name: 'Ada', email: 'ada@example.test', image: null };
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const at = (iso: string) => new Date(iso);
const SESSIONS = [
  {
    id: 'old-web',
    createdAt: at('2026-11-01T00:00:00Z'),
    updatedAt: at('2026-11-02T00:00:00Z'),
    userAgent: null,
    clientId: null,
    impersonatedBy: null,
  },
  {
    id: 'here',
    createdAt: at('2026-11-03T00:00:00Z'),
    updatedAt: at('2026-11-04T00:00:00Z'),
    userAgent: FIREFOX,
    clientId: null,
    impersonatedBy: null,
  },
  {
    id: 'extension',
    createdAt: at('2026-11-05T00:00:00Z'),
    updatedAt: at('2026-11-06T00:00:00Z'),
    userAgent: FIREFOX,
    clientId: 'emma-extension',
    impersonatedBy: null,
  },
  {
    id: 'viewed',
    createdAt: at('2026-11-07T00:00:00Z'),
    updatedAt: at('2026-11-07T00:00:00Z'),
    userAgent: null,
    clientId: null,
    impersonatedBy: 'admin',
  },
];

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<NonNullable<(typeof actions)['signOut']>>[0];

async function thrown(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Nothing was thrown');
}

/** The accounts' tables, holding the user's sessions, ending those asked for. */
function store(endSessions = vi.fn<AccountsStore['endSessions']>(() => Promise.resolve(1))) {
  return {
    endSessions,
    accounts: {
      sessionsOf: () => Promise.resolve(SESSIONS),
      linkedProviders: () => Promise.resolve([]),
      endSessions,
    } as unknown as AccountsStore,
  };
}

/** Better Auth, whose own listing refuses a session not signed in within the day. */
const staleAuth = {
  api: {
    listSessions: () => Promise.reject(new Error('Session is not fresh')),
    revokeSession: () => Promise.reject(new Error('Session is not fresh')),
  },
} as unknown as Auth;

describe("the profile's signed-in devices", () => {
  // Regression: the list was Better Auth's own, which asks for a session signed in within the day, so the profile of
  // anyone signed in longer failed with a 500, "Session is not fresh".
  it('lists each session, this browser first, then the newest, with what signed in, however long ago this one began', async () => {
    const result = (await load(
      fakeEvent<LoadEvent>({
        url: 'http://catalogue.test/profile?signed-out=one',
        locals: {
          user: USER as never,
          session: { id: 'here' } as never,
          auth: staleAuth,
          accounts: store().accounts,
        },
      }),
    )) as { devices: Device[]; signedOut: string | null; impersonated: boolean };
    expect(result.devices.map(({ id, kind, current, agent }) => ({ id, kind, current, agent }))).toEqual([
      { id: 'here', kind: 'website', current: true, agent: 'Firefox on Linux' },
      { id: 'viewed', kind: 'impersonation', current: false, agent: null },
      { id: 'extension', kind: 'emma-extension', current: false, agent: 'Firefox on Linux' },
      { id: 'old-web', kind: 'website', current: false, agent: null },
    ]);
    expect(JSON.stringify(result.devices)).not.toMatch(/"t[1-4]"/);
    expect(result).toMatchObject({ signedOut: 'one', impersonated: false });
  });

  function act(
    action: 'signOut' | 'signOutOthers',
    body: string,
    endSessions = vi.fn<AccountsStore['endSessions']>(() => Promise.resolve(1)),
    more: { user?: unknown; session?: unknown } = {},
  ) {
    return actions[action]?.(
      fakeEvent<ActionEvent>({
        url: `http://catalogue.test/profile?/${action}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        locals: {
          user: ('user' in more ? more.user : USER) as never,
          session: ('session' in more ? more.session : { id: 'here' }) as never,
          auth: staleAuth,
          accounts: store(endSessions).accounts,
        },
      }),
    );
  }

  it('signs one out by its id, the user’s alone, however long ago this session began', async () => {
    const endSessions = vi.fn<AccountsStore['endSessions']>(() => Promise.resolve(1));
    const error = await thrown(() => act('signOut', 'session=extension', endSessions));
    expect(isRedirect(error) && error.location).toBe('/profile?signed-out=one');
    expect(endSessions).toHaveBeenCalledWith('ada', { only: 'extension' });
  });

  it('refuses a session that is not the user’s, or this one', async () => {
    const none = vi.fn<AccountsStore['endSessions']>(() => Promise.resolve(0));
    const unknown = await act('signOut', 'session=someone-elses', none);
    expect(isActionFailure(unknown) && unknown.data).toEqual({ devices: 'refused' });
    const endSessions = vi.fn<AccountsStore['endSessions']>(() => Promise.resolve(1));
    const here = await act('signOut', 'session=here', endSessions);
    expect(isActionFailure(here) && here.status).toBe(404);
    expect(endSessions).not.toHaveBeenCalled();
  });

  it('signs out every other session', async () => {
    const endSessions = vi.fn<AccountsStore['endSessions']>(() => Promise.resolve(3));
    const error = await thrown(() => act('signOutOthers', '', endSessions));
    expect(isRedirect(error) && error.location).toBe('/profile?signed-out=others');
    expect(endSessions).toHaveBeenCalledWith('ada', { except: 'here' });
  });

  it.each(['signOut', 'signOutOthers'] as const)(
    '%s is refused while an admin views the site as the user',
    async action => {
      const endSessions = vi.fn<AccountsStore['endSessions']>(() => Promise.resolve(1));
      const result = await act(action, 'session=extension', endSessions, {
        session: { id: 'here', impersonatedBy: 'admin' },
      });
      expect(isActionFailure(result) && result.status).toBe(403);
      expect(endSessions).not.toHaveBeenCalled();
    },
  );

  it.each(['signOut', 'signOutOthers'] as const)('%s goes home for anyone not signed in', async action => {
    const error = await thrown(() => act(action, '', undefined, { user: null, session: null }));
    expect(isRedirect(error) && error.location).toBe('/');
  });
});
