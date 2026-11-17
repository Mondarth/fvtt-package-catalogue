import { makeSignature } from 'better-auth/crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { refusalOf } from '../../../../src/lib/server/accounts/admin-hooks.js';
import { auditStore } from '../../../../src/lib/server/accounts/audit.js';
import { createAuth } from '../../../../src/lib/server/accounts/auth.js';
import { deleteExpiredDeviceCodes, isDeviceClient } from '../../../../src/lib/server/accounts/device.js';
import { deviceCodes, sessions, users } from '../../../../src/lib/server/accounts/schema.js';
import { testDatabase } from '../../support/pglite.js';

import type { Auth } from '../../../../src/lib/server/accounts/auth.js';
import type { Database } from '../../../../src/lib/server/db/database.js';

const SECRET = 'a-test-secret-a-test-secret-a-test-secret';
const SITE = 'https://catalogue.test';
const GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

let db: Database;
let close: () => Promise<void>;
let auth: Auth;

beforeEach(async () => {
  ({ db, close } = await testDatabase());
  auth = createAuth({ db, audit: auditStore(db), secret: SECRET, siteUrl: SITE });
  await db.insert(users).values([
    { id: 'ada', name: 'Ada', email: 'ada@example.test', handle: 'handle-ada' },
    { id: 'admin', name: 'Admin', email: 'admin@example.test', handle: 'handle-admin', role: 'admin' },
  ]);
});

afterEach(() => close());

/** The headers of a browser signed in as a user. */
async function signedIn(userId: string): Promise<Headers> {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(userId, false, {}, true);
  const signed = `${session.token}.${await makeSignature(session.token, SECRET)}`;
  return new Headers({ cookie: `${ctx.authCookies.sessionToken.name}=${signed}` });
}

/** The codes a device is given. */
const codes = () => auth.api.deviceCode({ body: { client_id: 'emma-extension' } });

/** What polling for the token gives: the token, or the error. */
async function poll(deviceCode: string): Promise<{ access_token?: string; error?: string }> {
  const response = await auth.api.deviceToken({
    body: { grant_type: GRANT, device_code: deviceCode, client_id: 'emma-extension' },
    asResponse: true,
  });
  return (await response.json()) as { access_token?: string; error?: string };
}

describe('isDeviceClient', () => {
  it("is EMMA's browser extension alone", () => {
    expect(isDeviceClient('emma-extension')).toBe(true);
    expect(isDeviceClient('anything-else')).toBe(false);
    expect(isDeviceClient(undefined)).toBe(false);
  });
});

describe('signing a device in', () => {
  it('gives it codes, good for ten minutes, sending its user to /device', async () => {
    const given = await codes();
    expect(given.verification_uri).toMatch(/\/device$/);
    expect(given.expires_in).toBe(600);
    expect(given.interval).toBe(5);
    expect(given.user_code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('refuses a client it does not know', async () => {
    await expect(auth.api.deviceCode({ body: { client_id: 'stranger' } })).rejects.toThrow();
  });

  it('waits for its user, then gives it a session of its own, marked with its client, that the API takes', async () => {
    const given = await codes();
    expect(await poll(given.device_code)).toMatchObject({ error: 'authorization_pending' });

    const headers = await signedIn('ada');
    const looked = await auth.api.deviceVerify({ query: { user_code: given.user_code }, headers });
    expect(looked).toMatchObject({ status: 'pending', client_id: 'emma-extension' });
    await auth.api.deviceApprove({ body: { userCode: given.user_code }, headers });

    // Polling again within the interval is answered `slow_down`: as if the interval had passed.
    await db.update(deviceCodes).set({ lastPolledAt: null });
    const { access_token: token } = await poll(given.device_code);
    expect(token).toBeTruthy();
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token ?? ''));
    expect(session).toMatchObject({ userId: 'ada', clientId: 'emma-extension' });
    const found = await auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${token ?? ''}` }) });
    expect(found?.user.id).toBe('ada');
  });

  it('marks none of the website’s own sessions with a client', async () => {
    await signedIn('ada');
    expect((await db.select().from(sessions)).map(session => session.clientId)).toEqual([null]);
  });

  it('tells a device polling too often to slow down', async () => {
    const given = await codes();
    await poll(given.device_code);
    expect(await poll(given.device_code)).toMatchObject({ error: 'slow_down' });
  });

  it('gives a denied device no token', async () => {
    const given = await codes();
    const headers = await signedIn('ada');
    await auth.api.deviceVerify({ query: { user_code: given.user_code }, headers });
    await auth.api.deviceDeny({ body: { userCode: given.user_code }, headers });
    expect(await poll(given.device_code)).toMatchObject({ error: 'access_denied' });
  });

  it('lets only the user who looked at a code first approve it', async () => {
    const given = await codes();
    await auth.api.deviceVerify({ query: { user_code: given.user_code }, headers: await signedIn('ada') });
    const other = await signedIn('admin');
    expect(await auth.api.deviceVerify({ query: { user_code: given.user_code }, headers: other })).not.toHaveProperty(
      'client_id',
    );
    await expect(auth.api.deviceApprove({ body: { userCode: given.user_code }, headers: other })).rejects.toThrow();
  });

  it('refuses an admin viewing the site as someone approving or denying a device', async () => {
    const given = await codes();
    const { headers: set } = await auth.api.impersonateUser({
      body: { userId: 'ada' },
      headers: await signedIn('admin'),
      returnHeaders: true,
    });
    const cookie = set
      .getSetCookie()
      .map(line => line.split(';')[0] ?? '')
      .filter(pair => !pair.endsWith('='))
      .join('; ');
    const viewing = new Headers({ cookie });
    await auth.api.deviceVerify({ query: { user_code: given.user_code }, headers: viewing });
    for (const call of [auth.api.deviceApprove, auth.api.deviceDeny]) {
      const refused: unknown = await call({ body: { userCode: given.user_code }, headers: viewing }).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(refusalOf((refused as { body?: { code?: string } } | undefined)?.body?.code)).toBe('impersonating');
    }
  });
});

describe('expired codes', () => {
  it('are deleted as a device asks for new ones, and only they', async () => {
    const kept = await codes();
    const [old] = await db.select().from(deviceCodes);
    await db
      .update(deviceCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(deviceCodes.id, old?.id ?? ''));
    await codes();
    const left = await db.select({ userCode: deviceCodes.userCode }).from(deviceCodes);
    expect(left).toHaveLength(1);
    expect(left[0]?.userCode).not.toBe(kept.user_code);
  });

  it('are deleted by the time given', async () => {
    await codes();
    await deleteExpiredDeviceCodes(db, new Date(Date.now() + 11 * 60 * 1000));
    expect(await db.select().from(deviceCodes)).toEqual([]);
  });
});
