import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { eq } from 'drizzle-orm';

import { accounts, users } from '../../../../src/lib/server/accounts/schema.js';
import {
  CHECK_EVERY_MS,
  forgetPatreonOf,
  GRACE_MS,
  patreonChecker,
  patreonUrl,
  readMembership,
  subscribes,
} from '../../../../src/lib/server/subscriptions/patreon.js';
import { catalogueSettings, patreonMemberships } from '../../../../src/lib/server/subscriptions/schema.js';
import { testDatabase } from '../../support/pglite.js';

import type { PatreonMembership, PatreonOptions } from '../../../../src/lib/server/subscriptions/patreon.js';
import type { Database } from '../../../../src/lib/server/db/database.js';

const CAMPAIGN = 'c-123';
const SCOPE = 'identity identity[email] identity.memberships';
const T0 = new Date('2026-11-20T12:00:00Z');
const later = (ms: number) => new Date(T0.getTime() + ms);
const HOUR = 60 * 60 * 1000;

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await testDatabase());
  await db.insert(users).values([
    { id: 'ada', name: 'Ada', email: 'ada@example.test', handle: 'handle-ada' },
    { id: 'bob', name: 'Bob', email: 'bob@example.test', handle: 'handle-bob' },
  ]);
  await db.insert(accounts).values([
    { id: 'acc-ada', userId: 'ada', providerId: 'patreon', accountId: 'p-ada', scope: SCOPE },
    { id: 'acc-bob', userId: 'bob', providerId: 'github', accountId: 'g-bob' },
  ]);
});

afterEach(() => close());

/**
 * Patreon's identity endpoint's answer for a user, a member of the catalogue's campaign or not.
 *
 * @param member - Their membership's attributes, or none
 * @param campaign - The campaign it is of
 * @returns The answer
 */
function identity(member: Record<string, unknown> | null, campaign = CAMPAIGN) {
  return {
    data: { id: 'p-ada', type: 'user', relationships: { memberships: { data: [{ id: 'm1', type: 'member' }] } } },
    included: [
      { id: 'other', type: 'member', attributes: { patron_status: 'active_patron' }, relationships: {} },
      ...(member === null
        ? []
        : [{ id: 'm1', type: 'member', attributes: member, relationships: { campaign: { data: { id: campaign } } } }]),
      { id: campaign, type: 'campaign' },
    ],
  };
}

const ACTIVE = {
  patron_status: 'active_patron',
  currently_entitled_amount_cents: 500,
  next_charge_date: '2026-12-01T00:00:00.000+00:00',
};

/**
 * A checker, with Patreon answering each request in turn, and a minimum set.
 *
 * @param answers - Patreon's answers, or errors to fail with
 * @param more - What else the checker is given
 * @returns The checker, what was fetched, and the token getter
 */
async function checker(answers: (Response | Error)[], more: Partial<PatreonOptions> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(() => {
    const next = answers.shift() ?? new Error('no more answers');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const accessToken = vi.fn<PatreonOptions['accessToken']>(() => Promise.resolve('p-token'));
  const patreon = patreonChecker({ db, campaignId: CAMPAIGN, accessToken, fetch, ...more });
  await patreon.setMinimum({ currency: 'GBP', amount: 300 }, 'admin');
  return { patreon, fetch, accessToken };
}

const membership = async () => (await db.select().from(patreonMemberships))[0];

describe('patreonUrl', () => {
  it("is a path of Patreon's, at its address or a stand-in's, keeping the stand-in's own path", () => {
    expect(patreonUrl('https://www.patreon.com', '/oauth2/authorize').href).toBe(
      'https://www.patreon.com/oauth2/authorize',
    );
    expect(patreonUrl('http://localhost:5173/__dev/patreon/', '/api/oauth2/token').href).toBe(
      'http://localhost:5173/__dev/patreon/api/oauth2/token',
    );
  });
});

describe('readMembership', () => {
  it("reads the user's membership of the catalogue's campaign alone", () => {
    expect(readMembership(identity(ACTIVE), CAMPAIGN)).toEqual({
      patronStatus: 'active_patron',
      amount: 500,
      nextChargeAt: new Date('2026-12-01T00:00:00Z'),
    });
  });

  it('is no membership for a user who is no member of it, or of another campaign alone', () => {
    const none = { patronStatus: null, amount: null, nextChargeAt: null };
    expect(readMembership(identity(null), CAMPAIGN)).toEqual(none);
    expect(readMembership(identity(ACTIVE, 'another'), CAMPAIGN)).toEqual(none);
    expect(readMembership({ data: {} }, CAMPAIGN)).toEqual(none);
  });

  it('leaves out what is not of its kind', () => {
    expect(
      readMembership(
        identity({ patron_status: 7, currently_entitled_amount_cents: 1.5, next_charge_date: 'soon' }),
        CAMPAIGN,
      ),
    ).toEqual({ patronStatus: null, amount: null, nextChargeAt: null });
    expect(
      readMembership(
        { data: {}, included: [{ type: 'member', relationships: { campaign: { data: { id: CAMPAIGN } } } }] },
        CAMPAIGN,
      ),
    ).toEqual({
      patronStatus: null,
      amount: null,
      nextChargeAt: null,
    });
  });

  it.each([null, 'text', {}, { data: {}, included: 'no' }])('is no answer for %j', answer => {
    expect(readMembership(answer, CAMPAIGN)).toBeUndefined();
  });
});

describe('subscribes', () => {
  const kept = (more: Partial<PatreonMembership> = {}): PatreonMembership => ({
    userId: 'ada',
    patronStatus: 'active_patron',
    amount: 500,
    nextChargeAt: null,
    checkedAt: T0,
    askedAt: T0,
    failure: null,
    ...more,
  });
  const minimum = { currency: 'GBP', amount: 300 };

  it('is an active patron at the least pledge or more', () => {
    expect(subscribes(kept(), minimum, T0)).toBe(true);
    expect(subscribes(kept({ amount: 300 }), minimum, T0)).toBe(true);
  });

  it('is no one pledging less, nor anyone not an active patron', () => {
    expect(subscribes(kept({ amount: 299 }), minimum, T0)).toBe(false);
    expect(subscribes(kept({ amount: null }), minimum, T0)).toBe(false);
    expect(subscribes(kept({ patronStatus: 'declined_patron' }), minimum, T0)).toBe(false);
    expect(subscribes(kept({ patronStatus: null }), minimum, T0)).toBe(false);
  });

  it('is no one without a least pledge set, or an answer', () => {
    expect(subscribes(kept(), null, T0)).toBe(false);
    expect(subscribes(null, minimum, T0)).toBe(false);
    expect(subscribes(kept({ checkedAt: null }), minimum, T0)).toBe(false);
  });

  it('counts an answer for a day and the grace, and no longer', () => {
    expect(subscribes(kept({ failure: 'unreachable' }), minimum, later(CHECK_EVERY_MS + GRACE_MS))).toBe(true);
    expect(subscribes(kept({ failure: 'unreachable' }), minimum, later(CHECK_EVERY_MS + GRACE_MS + 1))).toBe(false);
  });

  it('is no one Patreon no longer lets the catalogue ask about', () => {
    expect(subscribes(kept({ failure: 'revoked' }), minimum, T0)).toBe(false);
    expect(subscribes(kept({ failure: 'scope' }), minimum, T0)).toBe(false);
  });
});

describe('the checker', () => {
  it('says a user without Patreon linked is not subscribed by it, without asking', async () => {
    const { patreon, fetch } = await checker([]);
    expect(await patreon.status('bob', { now: T0 })).toEqual({ linked: false, subscribed: false, membership: null });
    expect(await patreon.kept('bob')).toEqual({ linked: false, subscribed: false, membership: null });
    expect(await patreon.accountOf('bob')).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks Patreon with the user's token, keeps its answer, and subscribes a patron at the least pledge", async () => {
    const { patreon, fetch, accessToken } = await checker([Response.json(identity(ACTIVE))]);
    const status = await patreon.status('ada', { now: T0 });

    expect(status).toMatchObject({ linked: true, subscribed: true });
    expect(accessToken).toHaveBeenCalledWith('ada', 'acc-ada');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url instanceof URL ? url.href : url).toBe(
      'https://www.patreon.com/api/oauth2/v2/identity?include=memberships.campaign&fields%5Bmember%5D=patron_status%2Ccurrently_entitled_amount_cents%2Cnext_charge_date',
    );
    expect(init).toEqual({ headers: { authorization: 'Bearer p-token' } });
    expect(await membership()).toMatchObject({
      patronStatus: 'active_patron',
      amount: 500,
      checkedAt: T0,
      askedAt: T0,
      failure: null,
    });
    expect(await patreon.accountOf('ada')).toBe('acc-ada');
  });

  it('keeps the answer a day, then asks again; and asks at once when asked to', async () => {
    const { patreon, fetch } = await checker([
      Response.json(identity(ACTIVE)),
      Response.json(identity({ ...ACTIVE, patron_status: 'former_patron' })),
      Response.json(identity(ACTIVE)),
    ]);
    await patreon.status('ada', { now: T0 });
    expect((await patreon.status('ada', { now: later(CHECK_EVERY_MS - 1) })).subscribed).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    expect((await patreon.status('ada', { now: later(CHECK_EVERY_MS) })).subscribed).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await patreon.status('ada', { now: later(CHECK_EVERY_MS + 1), force: true })).subscribed).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('applies a new least pledge at once, to what Patreon last said, and none subscribes no one', async () => {
    const { patreon } = await checker([Response.json(identity(ACTIVE))]);
    await patreon.status('ada', { now: T0 });
    await patreon.setMinimum({ currency: 'GBP', amount: 1000 }, 'admin');
    expect((await patreon.status('ada', { now: T0 })).subscribed).toBe(false);
    expect(await patreon.minimum()).toEqual({ currency: 'GBP', amount: 1000 });
    await patreon.setMinimum(null, 'admin');
    expect(await patreon.minimum()).toBeNull();
    expect((await patreon.kept('ada', T0)).subscribed).toBe(false);
    expect(await db.select().from(catalogueSettings)).toEqual([]);
  });

  it('reads a least pledge that is not one as none', async () => {
    const { patreon } = await checker([]);
    await db.update(catalogueSettings).set({ value: { currency: 'GBP' } });
    expect(await patreon.minimum()).toBeNull();
  });

  it('keeps counting the last answer while Patreon cannot be asked, asking each time, then stops', async () => {
    const { patreon, fetch } = await checker([
      Response.json(identity(ACTIVE)),
      new TypeError('fetch failed'),
      new Response('', { status: 503 }),
      new TypeError('fetch failed'),
    ]);
    await patreon.status('ada', { now: T0 });
    const outage = later(CHECK_EVERY_MS + HOUR);
    expect((await patreon.status('ada', { now: outage })).subscribed).toBe(true);
    expect(await membership()).toMatchObject({ failure: 'unreachable', checkedAt: T0, askedAt: outage, amount: 500 });
    expect((await patreon.status('ada', { now: later(CHECK_EVERY_MS + 2 * HOUR) })).subscribed).toBe(true);
    expect((await patreon.status('ada', { now: later(CHECK_EVERY_MS + GRACE_MS + 1) })).subscribed).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('is not subscribed by a first asking that fails', async () => {
    const { patreon } = await checker([new TypeError('fetch failed')]);
    expect(await patreon.status('ada', { now: T0 })).toMatchObject({ linked: true, subscribed: false });
    expect(await membership()).toMatchObject({ checkedAt: null, failure: 'unreachable' });
  });

  it.each([
    ['a token Patreon no longer takes', new Response('', { status: 401 }), 'revoked'],
    ['a token that may not read memberships', new Response('', { status: 403 }), 'scope'],
  ])('stops counting the last answer at once for %s', async (_why, answer, failure) => {
    const { patreon } = await checker([Response.json(identity(ACTIVE)), answer]);
    await patreon.status('ada', { now: T0 });
    expect((await patreon.status('ada', { now: later(1), force: true })).subscribed).toBe(false);
    expect(await membership()).toMatchObject({ failure });
  });

  it('does not ask with a token given before the catalogue asked for memberships', async () => {
    await db.update(accounts).set({ scope: 'identity identity[email]' }).where(eq(accounts.id, 'acc-ada'));
    const { patreon, fetch, accessToken } = await checker([]);
    expect((await patreon.status('ada', { now: T0 })).subscribed).toBe(false);
    expect(await membership()).toMatchObject({ failure: 'scope' });
    expect(accessToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    await db.update(accounts).set({ scope: null }).where(eq(accounts.id, 'acc-ada'));
    expect((await patreon.status('ada', { now: later(CHECK_EVERY_MS) })).membership?.failure).toBe('scope');
  });

  it('counts a token that cannot be had as Patreon not answering', async () => {
    const { patreon } = await checker([], {
      accessToken: () => Promise.reject(new Error('refresh failed')),
    });
    await patreon.status('ada', { now: T0 });
    expect(await membership()).toMatchObject({ failure: 'unreachable' });
  });

  it('counts an answer that is not the endpoint’s as Patreon not answering', async () => {
    const { patreon } = await checker([new Response('<html>'), Response.json({ nothing: true })]);
    await patreon.status('ada', { now: T0 });
    expect(await membership()).toMatchObject({ failure: 'unreachable' });
    await patreon.status('ada', { now: T0, force: true });
    expect(await membership()).toMatchObject({ failure: 'unreachable' });
  });

  it('asks Patreon once for requests at once', async () => {
    const { patreon, fetch } = await checker([Response.json(identity(ACTIVE))]);
    const both = await Promise.all([patreon.status('ada', { now: T0 }), patreon.status('ada', { now: T0 })]);
    expect(both.map(status => status.subscribed)).toEqual([true, true]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('asks nothing, and subscribes no one, without a campaign', async () => {
    const { patreon, fetch } = await checker([], { campaignId: undefined });
    expect(await patreon.status('ada', { now: T0 })).toEqual({ linked: true, subscribed: false, membership: null });
    expect(fetch).not.toHaveBeenCalled();
    expect((await patreon.kept('ada')).subscribed).toBe(false);
  });

  it('asks the address it is given, and reads the time now by default', async () => {
    const { patreon, fetch } = await checker([Response.json(identity(ACTIVE))], { baseUrl: 'http://stand-in.test' });
    expect((await patreon.status('ada')).linked).toBe(true);
    const [asked] = fetch.mock.calls[0] ?? [];
    expect(asked instanceof URL ? asked.href : asked).toMatch(/^http:\/\/stand-in\.test\/api\/oauth2\/v2\/identity/);
    expect((await patreon.kept('ada')).subscribed).toBe(true);
  });

  it('forgets what Patreon said of a user, and only of a Patreon account', async () => {
    const { patreon } = await checker([Response.json(identity(ACTIVE))]);
    await patreon.status('ada', { now: T0 });
    await forgetPatreonOf(db, { providerId: 'github', userId: 'ada' });
    expect(await membership()).toBeDefined();
    await patreon.forget('ada');
    expect(await membership()).toBeUndefined();
  });

  it('uses the global fetch by default', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(Response.json(identity(ACTIVE))));
    vi.stubGlobal('fetch', fetch);
    const patreon = patreonChecker({ db, campaignId: CAMPAIGN, accessToken: () => Promise.resolve('t') });
    await patreon.status('ada', { now: T0 });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
