import { makeSignature } from 'better-auth/crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { refusalOf, REFUSALS } from '../../../../src/lib/server/accounts/admin-hooks.js';
import { auditStore } from '../../../../src/lib/server/accounts/audit.js';
import { AUTH_PATH, createAuth } from '../../../../src/lib/server/accounts/auth.js';
import { auditLog, sessions, users } from '../../../../src/lib/server/accounts/schema.js';
import { testDatabase } from '../../support/pglite.js';

import type { AuditStore } from '../../../../src/lib/server/accounts/audit.js';
import type { Auth } from '../../../../src/lib/server/accounts/auth.js';
import type { Database } from '../../../../src/lib/server/db/database.js';

const SECRET = 'a-test-secret-a-test-secret-a-test-secret';
const SITE = 'https://catalogue.test';

let db: Database;
let close: () => Promise<void>;
let audit: AuditStore;
let auth: Auth;

/** An admin by role; another; an admin by ADMIN_USER_IDS alone; and two users. */
const PEOPLE = [
  { id: 'admin', role: 'admin' },
  { id: 'admin-2', role: 'admin' },
  { id: 'configured', role: 'user' },
  { id: 'user', role: 'user' },
  { id: 'user-2', role: null },
] as const;

beforeEach(async () => {
  ({ db, close } = await testDatabase());
  audit = auditStore(db);
  auth = createAuth({ db, audit, secret: SECRET, siteUrl: SITE, adminUserIds: ['configured'] });
  await db
    .insert(users)
    .values(
      PEOPLE.map(({ id, role }) => ({ id, role, name: id, email: `${id}@example.test`, handle: `handle-${id}` })),
    );
});

afterEach(() => close());

/**
 * The headers of a browser signed in as a user, with a session of their own.
 *
 * @param userId - Who
 * @returns The headers, with the signed session cookie
 */
async function signedIn(userId: string): Promise<Headers> {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(userId, false, {}, true);
  const signed = `${session.token}.${await makeSignature(session.token, SECRET)}`;
  return new Headers({ cookie: `${ctx.authCookies.sessionToken.name}=${signed}` });
}

/** The cookies a response set, as a browser would send them back. */
function cookiesFrom(set: Headers): Headers {
  const cookie = set
    .getSetCookie()
    .map(line => line.split(';')[0] ?? '')
    .filter(pair => !pair.endsWith('='))
    .join('; ');
  return new Headers({ cookie });
}

/** What a call was refused with: the hooks' refusal, or Better Auth's own status. */
async function refusal(call: Promise<unknown>): Promise<string | number> {
  try {
    await call;
  } catch (error) {
    const { body, statusCode } = error as { body?: { code?: string }; statusCode?: number };
    return refusalOf(body?.code) ?? statusCode ?? 'unknown';
  }
  throw new Error('It was not refused');
}

const entries = () => db.select().from(auditLog).orderBy(auditLog.id);
const roleOf = async (id: string) =>
  (await db.select({ role: users.role }).from(users).where(eq(users.id, id)))[0]?.role;

describe('an admin', () => {
  it("sets a user's role, which is recorded with how it was and is", async () => {
    await auth.api.setRole({ body: { userId: 'user', role: 'admin' }, headers: await signedIn('admin') });
    expect(await roleOf('user')).toBe('admin');
    expect(await entries()).toMatchObject([
      { actorId: 'admin', asUserId: null, action: 'user.set-role', subjectId: 'user' },
    ]);
    const [entry] = await entries();
    expect(entry?.before).toEqual({ role: 'user' });
    expect(entry?.after).toEqual({ role: 'admin' });
  });

  it('records a user without a role as a user', async () => {
    await auth.api.setRole({ body: { userId: 'user-2', role: 'admin' }, headers: await signedIn('admin') });
    expect((await entries())[0]?.before).toEqual({ role: 'user' });
  });

  it('bans a user, with a reason and an end, and unbans them, each recorded', async () => {
    const headers = await signedIn('admin');
    await auth.api.banUser({ body: { userId: 'user', banReason: 'Spam', banExpiresIn: 3600 }, headers });
    await auth.api.unbanUser({ body: { userId: 'user' }, headers });
    const [ban, unban] = await entries();
    expect(ban).toMatchObject({ action: 'user.ban', subjectId: 'user' });
    expect(ban?.before).toEqual({ banned: false, reason: null, expires: null });
    expect(ban?.after).toMatchObject({ banned: true, reason: 'Spam' });
    expect(unban).toMatchObject({ action: 'user.unban' });
    expect(unban?.before).toMatchObject({ banned: true, reason: 'Spam' });
    expect(unban?.after).toEqual({ banned: false, reason: null, expires: null });
  });

  it('signs a user out everywhere, which is recorded', async () => {
    await signedIn('user');
    await auth.api.revokeUserSessions({ body: { userId: 'user' }, headers: await signedIn('admin') });
    expect(await db.select().from(sessions).where(eq(sessions.userId, 'user'))).toEqual([]);
    expect(await entries()).toMatchObject([{ action: 'user.revoke-sessions', subjectId: 'user', before: null }]);
  });

  it.each([
    ['set their role', (headers: Headers) => auth.api.setRole({ body: { userId: 'admin', role: 'user' }, headers })],
    ['ban', (headers: Headers) => auth.api.banUser({ body: { userId: 'admin' }, headers })],
    ['sign out', (headers: Headers) => auth.api.revokeUserSessions({ body: { userId: 'admin' }, headers })],
    ['view the site as', (headers: Headers) => auth.api.impersonateUser({ body: { userId: 'admin' }, headers })],
  ])('may not %s themselves', async (_, call) => {
    expect(await refusal(call(await signedIn('admin')))).toBe('self');
    expect(await entries()).toEqual([]);
  });

  it('may not change the role or ban of an admin ADMIN_USER_IDS names', async () => {
    const headers = await signedIn('admin');
    expect(await refusal(auth.api.setRole({ body: { userId: 'configured', role: 'user' }, headers }))).toBe(
      'configured',
    );
    expect(await refusal(auth.api.banUser({ body: { userId: 'configured' }, headers }))).toBe('configured');
    expect(await refusal(auth.api.unbanUser({ body: { userId: 'configured' }, headers }))).toBe('configured');
  });

  it('may not give a role there is not', async () => {
    const call = auth.api.setRole({
      body: { userId: 'user', role: 'superuser' as 'admin' },
      headers: await signedIn('admin'),
    });
    expect(await refusal(call)).toBe('role');
  });

  it('may not view the site as another admin, by role or as ADMIN_USER_IDS names them', async () => {
    const headers = await signedIn('admin');
    expect(await refusal(auth.api.impersonateUser({ body: { userId: 'admin-2' }, headers }))).toBe('admin');
    expect(await refusal(auth.api.impersonateUser({ body: { userId: 'configured' }, headers }))).toBe('admin');
  });
});

describe('an admin ADMIN_USER_IDS names', () => {
  it('is an admin whatever their role, and is recorded as one', async () => {
    await auth.api.setRole({ body: { userId: 'user', role: 'admin' }, headers: await signedIn('configured') });
    expect(await roleOf('user')).toBe('admin');
    expect(await entries()).toMatchObject([{ actorId: 'configured', action: 'user.set-role' }]);
  });

  it('may still not view the site as another admin, though Better Auth would let them', async () => {
    const call = auth.api.impersonateUser({ body: { userId: 'admin' }, headers: await signedIn('configured') });
    expect(await refusal(call)).toBe('admin');
  });
});

describe('a call that changes nothing', () => {
  it('is not recorded: without a session, for a user there is not, or without a user named', async () => {
    const headers = await signedIn('admin');
    expect(await refusal(auth.api.setRole({ body: { userId: 'user', role: 'admin' }, headers: new Headers() }))).toBe(
      401,
    );
    expect(await refusal(auth.api.setRole({ body: { userId: 'nobody', role: 'admin' }, headers }))).not.toBe('self');
    expect(await refusal(auth.api.banUser({ body: { userId: 7 }, headers }))).not.toBe('self');
    expect(await refusal(auth.api.banUser({ body: undefined as never, headers }))).not.toBe('self');
    expect(await entries()).toEqual([]);
  });

  it('is not recorded when an admin stops viewing the site as someone without having begun', async () => {
    expect(await refusal(auth.api.stopImpersonating({ headers: await signedIn('admin') }))).toBe(400);
    expect(await entries()).toEqual([]);
  });
});

describe('a user', () => {
  it('may do none of what an admin does, and nothing is recorded', async () => {
    const headers = await signedIn('user');
    expect(await refusal(auth.api.setRole({ body: { userId: 'user-2', role: 'admin' }, headers }))).toBe(403);
    expect(await refusal(auth.api.impersonateUser({ body: { userId: 'user-2' }, headers }))).toBe(403);
    expect(await entries()).toEqual([]);
  });
});

describe('viewing the site as someone', () => {
  /** The admin viewing the site as the user: the browser's cookies, as Better Auth set them. */
  async function viewingAsUser(): Promise<Headers> {
    const { headers } = await auth.api.impersonateUser({
      body: { userId: 'user' },
      headers: await signedIn('admin'),
      returnHeaders: true,
    });
    return cookiesFrom(headers);
  }

  it('is recorded, and so is stopping, both as the admin, about the user', async () => {
    const headers = await viewingAsUser();
    const viewed = await auth.api.getSession({ headers });
    expect(viewed?.user.id).toBe('user');
    expect(viewed?.session.impersonatedBy).toBe('admin');

    await auth.api.stopImpersonating({ headers });
    expect(await entries()).toMatchObject([
      { actorId: 'admin', action: 'user.impersonate', subjectId: 'user' },
      { actorId: 'admin', action: 'user.stop-impersonating', subjectId: 'user' },
    ]);
  });

  it('refuses what an admin does, and deleting the profile, until stopped', async () => {
    const headers = await viewingAsUser();
    expect(await refusal(auth.api.setRole({ body: { userId: 'user-2', role: 'admin' }, headers }))).toBe(
      'impersonating',
    );
    expect(await refusal(auth.api.deleteUser({ body: {}, headers }))).toBe('impersonating');
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, 'user'))).toHaveLength(1);
  });

  it('lasts an hour', async () => {
    const headers = await viewingAsUser();
    const viewed = await auth.api.getSession({ headers });
    const minutes = ((viewed?.session.expiresAt.getTime() ?? 0) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(59);
    expect(minutes).toBeLessThanOrEqual(60);
  });
});

describe('a profile deleted', () => {
  it('leaves the audit log who did what to its id, and when, but nothing it held of them', async () => {
    await auth.api.banUser({ body: { userId: 'user', banReason: 'Spam' }, headers: await signedIn('admin') });
    await auth.api.unbanUser({ body: { userId: 'user' }, headers: await signedIn('admin') });
    await auth.api.deleteUser({ body: {}, headers: await signedIn('user') });
    expect(await entries()).toMatchObject([
      { action: 'user.ban', subjectId: 'user', before: null, after: null },
      { action: 'user.unban', subjectId: 'user', before: null, after: null },
    ]);
  });
});

describe('the endpoints the website does not offer', () => {
  it.each(['create-user', 'set-user-password', 'update-user', 'remove-user', 'revoke-user-session'])(
    '/admin/%s is not found',
    async path => {
      const response = await auth.handler(
        new Request(`${SITE}${AUTH_PATH}/admin/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: SITE },
          body: '{}',
        }),
      );
      expect(response.status).toBe(404);
    },
  );
});

describe('refusalOf', () => {
  it("reads the hooks' refusals from their codes, and nothing else", () => {
    for (const why of Object.keys(REFUSALS)) expect(refusalOf(`REFUSED_${why.toUpperCase()}`)).toBe(why);
    expect(refusalOf('REFUSED_ELSE')).toBeUndefined();
    expect(refusalOf('FORBIDDEN')).toBeUndefined();
    expect(refusalOf(undefined)).toBeUndefined();
  });
});
