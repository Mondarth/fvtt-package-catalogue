import { isActionFailure, isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { load as auditLoad } from '../../../src/routes/admin/audit/+page.server.js';
import { load as adminLayoutLoad } from '../../../src/routes/admin/+layout.server.js';
import { load as adminLoad } from '../../../src/routes/admin/+page.server.js';
import { POST as impersonate } from '../../../src/routes/admin/users/[id]/impersonate/+server.js';
import { actions, load as userLoad } from '../../../src/routes/admin/users/[id]/+page.server.js';
import { load as usersLoad } from '../../../src/routes/admin/users/+page.server.js';
import { USERS_PER_PAGE } from '../../../src/lib/admin.js';
import { POST as stopImpersonating } from '../../../src/routes/impersonation/stop/+server.js';
import { fakeEvent, invoke } from '../support/event.js';

import type { AuditRow, AuditStore } from '../../../src/lib/server/accounts/audit.js';
import type { Auth } from '../../../src/lib/server/accounts/auth.js';
import type { AccountsStore, UserDetail, UserSummary } from '../../../src/lib/server/accounts/store.js';

const ADMIN = { id: 'admin', handle: 'admin-handle', nickname: null, role: 'admin' };
const SUMMARY: UserSummary = {
  id: 'u1',
  handle: 'amber-fox-oak-01',
  nickname: null,
  name: 'One',
  email: 'one@example.test',
  role: null,
  banned: false,
  createdAt: new Date('2026-11-01T00:00:00Z'),
};
const DETAIL: UserDetail = {
  ...SUMMARY,
  image: null,
  banReason: null,
  banExpires: null,
  providers: [{ providerId: 'github', linkedAt: new Date() }],
  sessions: 2,
};

type UserEvent = Parameters<typeof userLoad>[0];
type LayoutEvent = Parameters<typeof adminLayoutLoad>[0];
type AdminEvent = Parameters<typeof adminLoad>[0];
type UsersEvent = Parameters<typeof usersLoad>[0];
type AuditEvent = Parameters<typeof auditLoad>[0];
type Action = keyof typeof actions;
type ActionEvent = Parameters<NonNullable<(typeof actions)['role']>>[0];

/** Better Auth, as the routes call it. */
const fakeAuth = (api: Record<string, (...args: never[]) => Promise<Response>>) => ({ api }) as unknown as Auth;

/** What a load or action threw, which SvelteKit's redirect and error are. */
async function thrown(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Nothing was thrown');
}

/** A response of Better Auth's, setting a cookie. */
function answer(body: unknown, status = 200): Response {
  const response = Response.json(body, { status });
  response.headers.append('Set-Cookie', 'better-auth.session=x');
  return response;
}

describe('the admin pages', () => {
  it('are not found for anyone but an admin', async () => {
    const error = await thrown(() => adminLayoutLoad(fakeEvent<LayoutEvent>({ locals: { isAdmin: false } })));
    expect(isHttpError(error, 404)).toBe(true);
    expect(adminLayoutLoad(fakeEvent<LayoutEvent>({ locals: { isAdmin: true } }))).toEqual({});
  });

  it('start at the list of users', async () => {
    const error = await thrown(() => adminLoad(fakeEvent<AdminEvent>()));
    expect(isRedirect(error) && error.location).toBe('/admin/users');
  });
});

describe('the list of users', () => {
  const list = (url: string, listUsers = vi.fn<AccountsStore['listUsers']>()) => {
    listUsers.mockResolvedValue({ users: [SUMMARY, { ...SUMMARY, id: 'configured' }], total: 120 });
    return {
      listUsers,
      loaded: usersLoad(
        fakeEvent<UsersEvent>({
          url,
          locals: { accounts: { listUsers } as unknown as AccountsStore, adminUserIds: ['configured'] },
        }),
      ),
    };
  };

  it('finds users by the search, a page at a time, marking the admins', async () => {
    const { listUsers, loaded } = list('http://catalogue.test/admin/users?q=+amber+&page=2');
    await expect(loaded).resolves.toMatchObject({
      search: 'amber',
      page: 2,
      pages: Math.ceil(120 / USERS_PER_PAGE),
      total: 120,
      users: [
        { id: 'u1', admin: false },
        { id: 'configured', admin: true },
      ],
    });
    expect(listUsers).toHaveBeenCalledWith({ search: 'amber', limit: USERS_PER_PAGE, offset: USERS_PER_PAGE });
  });

  it('starts at the first page, whatever page it is given that is not one', () => {
    expect(list('http://catalogue.test/admin/users').listUsers).toHaveBeenCalledWith({
      search: '',
      limit: USERS_PER_PAGE,
      offset: 0,
    });
    for (const page of ['', '0', '-3', 'x']) {
      const { listUsers } = list(`http://catalogue.test/admin/users?page=${page}`);
      expect(listUsers).toHaveBeenCalledWith({ search: '', limit: USERS_PER_PAGE, offset: 0 });
    }
  });
});

describe("a user's admin page", () => {
  const recent = vi.fn<AuditStore['recent']>(() => Promise.resolve([]));
  const loaded = (id: string, url = `http://catalogue.test/admin/users/${id}`, adminUserIds: string[] = []) =>
    userLoad(
      fakeEvent<UserEvent>({
        url,
        params: { id },
        locals: {
          user: ADMIN as never,
          accounts: {
            userDetail: (userId: string) =>
              Promise.resolve(userId === 'nobody' ? undefined : { ...DETAIL, id: userId }),
          } as unknown as AccountsStore,
          audit: { recent } as unknown as AuditStore,
          adminUserIds,
        },
      }),
    );

  it('shows what is held of the user, and what admins did about them', async () => {
    await expect(loaded('u1', 'http://catalogue.test/admin/users/u1?done=ban')).resolves.toMatchObject({
      user: { id: 'u1', providers: ['github'], sessions: 2, admin: false, configured: false, self: false },
      audit: [],
      done: 'ban',
      refused: null,
    });
    expect(recent).toHaveBeenCalledWith({ limit: 20, userId: 'u1' });
  });

  it('says when it is the admin themselves, or an admin ADMIN_USER_IDS names', async () => {
    await expect(loaded('admin')).resolves.toMatchObject({ user: { self: true } });
    await expect(
      loaded('configured', 'http://catalogue.test/admin/users/configured?refused=admin', ['configured']),
    ).resolves.toMatchObject({ user: { admin: true, configured: true }, refused: 'admin' });
  });

  it('is not found for a user there is not', async () => {
    expect(isHttpError(await thrown(() => loaded('nobody')), 404)).toBe(true);
  });
});

describe("a user's admin page's actions", () => {
  /** Runs an action with a form, against Better Auth answering so. */
  function act(action: Action, form: Record<string, string>, call: (...args: never[]) => Promise<Response>) {
    const api = { setRole: call, banUser: call, unbanUser: call, revokeUserSessions: call };
    const run = actions[action];
    if (run === undefined) throw new Error(`No ${action} action`);
    return run(
      fakeEvent<ActionEvent>({
        url: `http://catalogue.test/admin/users/u1?/${action}`,
        method: 'POST',
        params: { id: 'u1' },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
        locals: { auth: fakeAuth(api) },
      }),
    );
  }

  it.each([
    ['role', { role: 'admin' }, { userId: 'u1', role: 'admin' }],
    ['ban', { reason: ' Spam ', days: '7' }, { userId: 'u1', banReason: 'Spam', banExpiresIn: 7 * 24 * 60 * 60 }],
    ['ban', { reason: '', days: '' }, { userId: 'u1' }],
    ['ban', { days: '0' }, { userId: 'u1' }],
    ['unban', {}, { userId: 'u1' }],
    ['signOut', {}, { userId: 'u1' }],
  ] as const)('%s asks Better Auth, and comes back to the page saying it is done', async (action, form, body) => {
    const call = vi.fn(() => Promise.resolve(answer({})));
    const error = await thrown(() => act(action, form, call));
    expect(isRedirect(error) && error.location).toBe(`/admin/users/u1?done=${action}`);
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ body, asResponse: true }));
  });

  it("says why Better Auth's hooks refused", async () => {
    const result = await act('role', { role: 'user' }, () =>
      Promise.resolve(answer({ code: 'REFUSED_CONFIGURED' }, 403)),
    );
    expect(isActionFailure(result) && result).toMatchObject({ status: 403, data: { refusal: 'configured' } });
  });

  it('says only that it failed for any other refusal', async () => {
    const result = await act('unban', {}, () => Promise.resolve(new Response('no', { status: 500 })));
    expect(isActionFailure(result) && result).toMatchObject({ status: 500, data: { refusal: null } });
  });

  it('refuses a role there is not, and a reason too long, without asking', async () => {
    const call = vi.fn(() => Promise.resolve(answer({})));
    expect(await act('role', { role: 'superuser' }, call)).toMatchObject({ status: 400, data: { refusal: 'role' } });
    expect(await act('ban', { reason: 'x'.repeat(201) }, call)).toMatchObject({
      status: 400,
      data: { reasonTooLong: true },
    });
    expect(call).not.toHaveBeenCalled();
  });
});

describe('POST /admin/users/[id]/impersonate', () => {
  const post = (impersonateUser: (...args: never[]) => Promise<Response>, isAdmin = true) =>
    invoke(impersonate, {
      method: 'POST',
      params: { id: 'u1' },
      locals: { isAdmin, auth: fakeAuth({ impersonateUser }) },
    });

  it("takes the admin home as the user, with Better Auth's cookies", async () => {
    const impersonateUser = vi.fn(() => Promise.resolve(answer({})));
    const response = await post(impersonateUser);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.getSetCookie()).toEqual(['better-auth.session=x']);
    expect(impersonateUser).toHaveBeenCalledWith(expect.objectContaining({ body: { userId: 'u1' } }));
  });

  it("comes back to the user's page saying why it was refused", async () => {
    const refused = await post(() => Promise.resolve(answer({ code: 'REFUSED_ADMIN' }, 403)));
    expect(refused.headers.get('Location')).toBe('/admin/users/u1?refused=admin');
    const failed = await post(() => Promise.resolve(new Response('no', { status: 500 })));
    expect(failed.headers.get('Location')).toBe('/admin/users/u1?refused=failed');
  });

  it('is not found for anyone but an admin', async () => {
    const error = await thrown(() => post(() => Promise.resolve(answer({})), false));
    expect(isHttpError(error, 404)).toBe(true);
  });
});

describe('POST /impersonation/stop', () => {
  const post = (stop: (...args: never[]) => Promise<Response>, impersonatedBy?: string) =>
    invoke(stopImpersonating, {
      method: 'POST',
      locals: {
        user: { id: 'u1' } as never,
        session: { id: 's1', impersonatedBy } as never,
        auth: fakeAuth({ stopImpersonating: stop }),
      },
    });

  it("takes the admin back to the user's page as themselves", async () => {
    const stop = vi.fn(() => Promise.resolve(answer({})));
    const response = await post(stop, 'admin');
    expect(response.headers.get('Location')).toBe('/admin/users/u1');
    expect(response.headers.getSetCookie()).toEqual(['better-auth.session=x']);
  });

  it('goes home when it cannot, or when no one is viewing the site as someone', async () => {
    const stop = vi.fn(() => Promise.resolve(new Response('no', { status: 500 })));
    expect((await post(stop, 'admin')).headers.get('Location')).toBe('/');
    const idle = vi.fn(() => Promise.resolve(answer({})));
    expect((await post(idle)).headers.get('Location')).toBe('/');
    expect(idle).not.toHaveBeenCalled();
  });
});

describe('the audit log page', () => {
  const entry = (id: number): AuditRow => ({
    id,
    at: new Date(),
    actorId: 'admin',
    asUserId: null,
    action: 'user.ban',
    subjectId: 'u1',
    before: null,
    after: null,
    requestId: null,
  });

  const loaded = (url: string, rows: AuditRow[]) => {
    const recent = vi.fn<AuditStore['recent']>(() => Promise.resolve(rows));
    return {
      recent,
      result: auditLoad(fakeEvent<AuditEvent>({ url, locals: { audit: { recent } as unknown as AuditStore } })),
    };
  };

  it('gives a page of entries, and where the next starts when there may be more', async () => {
    const full = Array.from({ length: 100 }, (_, index) => entry(500 - index));
    const { recent, result } = loaded('http://catalogue.test/admin/audit?before=501', full);
    await expect(result).resolves.toMatchObject({ next: 401 });
    expect(recent).toHaveBeenCalledWith({ limit: 100, beforeId: 501 });
  });

  it('gives no next page when it is the last, and starts at the newest without one asked for', async () => {
    const { recent, result } = loaded('http://catalogue.test/admin/audit?before=x', [entry(3)]);
    await expect(result).resolves.toMatchObject({ next: null });
    expect(recent).toHaveBeenCalledWith({ limit: 100 });
    const plain = loaded('http://catalogue.test/admin/audit', []);
    await expect(plain.result).resolves.toMatchObject({ entries: [], next: null });
    expect(plain.recent).toHaveBeenCalledWith({ limit: 100 });
  });
});
