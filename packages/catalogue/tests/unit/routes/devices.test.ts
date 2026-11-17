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
    token: 't1',
    createdAt: at('2026-11-01T00:00:00Z'),
    updatedAt: at('2026-11-02T00:00:00Z'),
    userAgent: null,
  },
  {
    id: 'here',
    token: 't2',
    createdAt: at('2026-11-03T00:00:00Z'),
    updatedAt: at('2026-11-04T00:00:00Z'),
    userAgent: FIREFOX,
  },
  {
    id: 'extension',
    token: 't3',
    createdAt: at('2026-11-05T00:00:00Z'),
    updatedAt: at('2026-11-06T00:00:00Z'),
    userAgent: FIREFOX,
    clientId: 'emma-extension',
  },
  {
    id: 'viewed',
    token: 't4',
    createdAt: at('2026-11-07T00:00:00Z'),
    updatedAt: at('2026-11-07T00:00:00Z'),
    userAgent: null,
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

const api = (more: Record<string, unknown> = {}) =>
  ({ api: { listSessions: () => Promise.resolve(SESSIONS), ...more } }) as unknown as Auth;

describe("the profile's signed-in devices", () => {
  it('lists each session, this browser first, then the newest, with what signed in, and never a token', async () => {
    const result = (await load(
      fakeEvent<LoadEvent>({
        url: 'http://catalogue.test/profile?signed-out=one',
        locals: {
          user: USER as never,
          session: { id: 'here' } as never,
          auth: api(),
          accounts: { linkedProviders: () => Promise.resolve([]) } as unknown as AccountsStore,
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

  function act(action: 'signOut' | 'signOutOthers', body: string, more: Record<string, unknown>, user: unknown = USER) {
    return actions[action]?.(
      fakeEvent<ActionEvent>({
        url: `http://catalogue.test/profile?/${action}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        locals: { user: user as never, auth: api(more) },
      }),
    );
  }

  it('signs one out by its id, finding its token here', async () => {
    const revokeSession = vi.fn(() => Promise.resolve(Response.json({ status: true })));
    const error = await thrown(() => act('signOut', 'session=extension', { revokeSession }));
    expect(isRedirect(error) && error.location).toBe('/profile?signed-out=one');
    expect(revokeSession).toHaveBeenCalledWith(expect.objectContaining({ body: { token: 't3' } }));
  });

  it('refuses a session that is not the user’s, or that Better Auth will not sign out', async () => {
    const revokeSession = vi.fn(() => Promise.resolve(new Response('no', { status: 403 })));
    const unknown = await act('signOut', 'session=someone-elses', { revokeSession });
    expect(isActionFailure(unknown) && unknown.data).toEqual({ devices: 'refused' });
    expect(revokeSession).not.toHaveBeenCalled();
    const refused = await act('signOut', 'session=extension', { revokeSession });
    expect(isActionFailure(refused) && refused.status).toBe(403);
  });

  it('signs out every other session', async () => {
    const revokeOtherSessions = vi.fn(() => Promise.resolve(Response.json({ status: true })));
    const error = await thrown(() => act('signOutOthers', '', { revokeOtherSessions }));
    expect(isRedirect(error) && error.location).toBe('/profile?signed-out=others');
    const refused = await act('signOutOthers', '', {
      revokeOtherSessions: () => Promise.resolve(new Response('no', { status: 403 })),
    });
    expect(isActionFailure(refused) && refused.data).toEqual({ devices: 'refused' });
  });

  it.each(['signOut', 'signOutOthers'] as const)('%s goes home for anyone not signed in', async action => {
    const error = await thrown(() => act(action, '', {}, null));
    expect(isRedirect(error) && error.location).toBe('/');
  });
});
