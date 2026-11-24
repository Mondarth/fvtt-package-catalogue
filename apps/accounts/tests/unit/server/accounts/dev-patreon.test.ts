import { createServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEV_CAMPAIGN,
  DEV_PATREON_PATH,
  DEV_PATRONS,
  devPatreon,
  devPatreonProvider,
  patronChooserPage,
  patronsPage,
} from '../../../../src/lib/server/accounts/dev-patreon.js';
import { readMembership } from '../../../../src/lib/server/subscriptions/patreon.js';

import type { Pledge } from '../../../../src/lib/server/accounts/dev-patreon.js';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let server: Server;
let base: string;

beforeEach(async () => {
  const provider = devPatreonProvider();
  server = createServer((request, response) => {
    provider(request, response, () => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('passed on');
    });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterEach(async () => {
  await new Promise(done => server.close(done));
});

/**
 * The stand-in's address for a path of its own.
 *
 * @param path - The path
 * @param query - The query
 * @returns The address
 */
const at = (path: string, query: Record<string, string> = {}) =>
  `${base}${DEV_PATREON_PATH}${path}?${new URLSearchParams(query).toString()}`;

/** Where the site wants the browser back. */
const callback = () => `${base}/auth/callback/patreon`;

/**
 * Signs in as a patron, through the stand-in, to the token it gives.
 *
 * @param patron - The patron
 * @returns The token
 */
async function tokenOf(patron: string): Promise<string> {
  const chosen = await fetch(at('/choose', { patron, redirect_uri: callback(), state: 's1' }), { redirect: 'manual' });
  expect(chosen.status).toBe(302);
  const back = new URL(chosen.headers.get('Location') ?? '');
  expect(back.searchParams.get('state')).toBe('s1');
  const traded = await fetch(`${base}${DEV_PATREON_PATH}/api/oauth2/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', code: back.searchParams.get('code') ?? '' }),
  });
  const { access_token: token, scope } = (await traded.json()) as { access_token: string; scope: string };
  expect(scope).toContain('identity.memberships');
  return token;
}

/**
 * What the identity endpoint says of a token, with memberships.
 *
 * @param token - The token
 * @returns The answer, and its status
 */
async function identity(token: string) {
  const response = await fetch(at('/api/oauth2/v2/identity', { include: 'memberships.campaign' }), {
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

/**
 * Sets a patron's pledge, as the patrons' page's forms do.
 *
 * @param form - The form's fields
 * @param path - The form's action
 * @returns The answer
 */
const post = (form: Record<string, string>, path = '/pledge') =>
  fetch(`${base}${DEV_PATREON_PATH}${path}`, {
    method: 'POST',
    body: new URLSearchParams(form),
    redirect: 'manual',
  });

describe('devPatreon', () => {
  const none = { app: undefined, url: undefined, campaignId: undefined };

  it('stands in for Patreon on the development server without a Patreon app', () => {
    expect(devPatreon(none, 'http://localhost:5173', true)).toEqual({
      app: { clientId: 'dev-patreon', clientSecret: 'dev-patreon' },
      url: `http://localhost:5173${DEV_PATREON_PATH}`,
      campaignId: DEV_CAMPAIGN,
    });
    expect(devPatreon({ ...none, campaignId: 'mine' }, 'http://localhost:5173', true).campaignId).toBe('mine');
  });

  it('is Patreon as set anywhere else, or with an app set', () => {
    expect(devPatreon(none, 'http://localhost:5173', false)).toEqual(none);
    const set = { app: { clientId: 'id', clientSecret: 'secret' }, url: undefined, campaignId: 'c' };
    expect(devPatreon(set, 'http://localhost:5173', true)).toBe(set);
  });
});

describe('the stand-in', () => {
  it('passes on what is not its own', async () => {
    expect(await (await fetch(`${base}/elsewhere`)).text()).toBe('passed on');
    expect(await (await fetch(`${base}${DEV_PATREON_PATH}-not`)).text()).toBe('passed on');
  });

  it('asks which patron to sign in as, back to the site alone', async () => {
    const asked = await fetch(at('/oauth2/authorize', { redirect_uri: callback(), state: 's1' }));
    expect(await asked.text()).toContain('patron-ada');
    for (const path of ['/oauth2/authorize', '/choose']) {
      const away = await fetch(at(path, { redirect_uri: 'https://elsewhere.test/callback' }));
      expect(away.status).toBe(400);
    }
    expect((await fetch(at('/choose', { patron: 'nobody', redirect_uri: callback() }))).status).toBe(400);
  });

  it('says who a token is for and their pledge to the campaign, which the catalogue reads', async () => {
    const { status, body } = await identity(await tokenOf('patron-ada'));
    expect(status).toBe(200);
    expect(body).toMatchObject({ data: { id: 'patron-ada', attributes: { email: 'patron-ada@dev.test' } } });
    expect(readMembership(body, DEV_CAMPAIGN)).toMatchObject({ patronStatus: 'active_patron', amount: 500 });
  });

  it('gives no membership to someone who is no member, nor without asking for memberships', async () => {
    expect(readMembership((await identity(await tokenOf('patron-linus'))).body, DEV_CAMPAIGN)).toEqual({
      patronStatus: null,
      amount: null,
      nextChargeAt: null,
    });
    const plain = await fetch(at('/api/oauth2/v2/identity'), {
      headers: { authorization: `Bearer ${await tokenOf('patron-ada')}` },
    });
    expect(((await plain.json()) as { included: unknown[] }).included).toEqual([]);
  });

  it('changes a pledge, or fails for a patron, as its page asks, and the tokens outlive it', async () => {
    const token = await tokenOf('patron-grace');
    expect((await post({ patron: 'patron-grace', status: 'active_patron', cents: '800' })).status).toBe(303);
    expect(readMembership((await identity(token)).body, DEV_CAMPAIGN)).toMatchObject({ amount: 800 });
    await post({ patron: 'patron-grace', status: '', cents: 'lots' });
    expect(readMembership((await identity(token)).body, DEV_CAMPAIGN)?.patronStatus).toBeNull();
    await post({ patron: 'patron-grace' }, '/down');
    expect((await identity(token)).status).toBe(503);
    const page = await (await fetch(at('/'))).text();
    expect(page).toContain('Patreon fails for them');
  });

  it('refuses an unknown patron, code or token', async () => {
    expect((await post({ patron: 'nobody' })).status).toBe(400);
    const traded = await fetch(`${base}${DEV_PATREON_PATH}/api/oauth2/token`, {
      method: 'POST',
      body: new URLSearchParams({ code: 'nope' }),
    });
    expect(traded.status).toBe(400);
    expect((await identity('someone-else')).status).toBe(401);
    expect((await identity('dev-ptoken-nobody')).status).toBe(401);
    const unsent = await fetch(at('/api/oauth2/v2/identity'));
    expect(unsent.status).toBe(401);
  });

  it('lists the patrons at its own address, with or without a slash', async () => {
    expect(await (await fetch(`${base}${DEV_PATREON_PATH}`)).text()).toContain('Dev Patreon');
  });

  it('sends the browser back without a state when the site gave none', async () => {
    const chosen = await fetch(at('/choose', { patron: 'patron-ada', redirect_uri: callback() }), {
      redirect: 'manual',
    });
    expect(new URL(chosen.headers.get('Location') ?? '').searchParams.has('state')).toBe(false);
  });

  it('refuses a token asked for without a code', async () => {
    const traded = await fetch(`${base}${DEV_PATREON_PATH}/api/oauth2/token`, { method: 'POST', body: '' });
    expect(traded.status).toBe(400);
  });

  it('answers 404 for a path of its own it does not know', async () => {
    expect((await fetch(at('/nothing'))).status).toBe(404);
  });
});

describe('its pages', () => {
  it('list each patron, with their pledge, escaped', () => {
    const page = patronsPage(
      new Map<string, Pledge>([
        ['patron-ada', { status: 'active_patron', cents: 500 }],
        ['patron-grace', 'down'],
        ['patron-linus', { status: null, cents: 0 }],
      ]),
    );
    expect(page).toContain('active_patron, 5.00');
    expect(page).toContain('Patreon fails for them');
    expect(page).toContain('no member');
    for (const patron of DEV_PATRONS) expect(page).toContain(patron.id);
  });

  it('ask which patron, keeping the state, or none', () => {
    expect(patronChooserPage({ redirectUri: 'http://x.test/cb', state: 'a"b' })).toContain('state=a%22b');
    expect(patronChooserPage({ redirectUri: 'http://x.test/cb', state: null })).not.toContain('state=');
  });
});
