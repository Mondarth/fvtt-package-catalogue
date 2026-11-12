import { createServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  chooserPage,
  DEV_PROVIDER_PATH,
  DEV_USERS,
  devProvider,
  testProviderUrl,
} from '../../../../src/lib/server/accounts/dev-provider.js';

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let server: Server;
let base: string;

beforeEach(async () => {
  const provider = devProvider(() => 'dev-newcomer');
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

/** The provider's address for a path of its own. */
const at = (path: string, query: Record<string, string> = {}) =>
  `${base}${DEV_PROVIDER_PATH}${path}?${new URLSearchParams(query).toString()}`;

/** Where the site wants the browser back. */
const callback = () => `${base}/auth/callback/test`;

/** Signs in as a user, from choosing them to the profile the token gives. */
async function signInAs(user: string): Promise<unknown> {
  const chosen = await fetch(at('/choose', { user, redirect_uri: callback(), state: 'st' }), { redirect: 'manual' });
  expect(chosen.status).toBe(302);
  const back = new URL(chosen.headers.get('Location') ?? '');
  expect(back.searchParams.get('state')).toBe('st');
  const token = await fetch(at('/token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: back.searchParams.get('code') ?? '' }).toString(),
  });
  const { access_token } = (await token.json()) as { access_token: string };
  const info = await fetch(at('/userinfo'), { headers: { Authorization: `Bearer ${access_token}` } });
  return info.json();
}

describe('testProviderUrl', () => {
  it('is the one given, or the development server’s own in development, or none', () => {
    expect(testProviderUrl('http://provider.test', 'http://localhost:5173', true)).toBe('http://provider.test');
    expect(testProviderUrl(undefined, 'http://localhost:5173', true)).toBe(`http://localhost:5173${DEV_PROVIDER_PATH}`);
    expect(testProviderUrl(undefined, 'https://catalogue.test', false)).toBeUndefined();
  });
});

describe('the dev provider', () => {
  it('asks who to sign in as: each dev user, or someone new', async () => {
    const page = await fetch(at('/authorize', { redirect_uri: callback(), state: 'st' }));
    expect(page.headers.get('Content-Type')).toContain('text/html');
    const html = await page.text();
    for (const user of DEV_USERS) expect(html).toContain(user.name);
    expect(html).toContain('Someone new');
    expect(html).toContain('state=st');
  });

  it('signs in as the user chosen, with their name, email address and picture', async () => {
    const linus = DEV_USERS.find(user => user.image !== undefined);
    await expect(signInAs(linus?.id ?? '')).resolves.toEqual({
      id: linus?.id,
      name: linus?.name,
      email: linus?.email,
      email_verified: true,
      picture: linus?.image,
    });
    await expect(signInAs('dev-ada')).resolves.toMatchObject({ id: 'dev-ada', email: 'ada@dev.test' });
  });

  it('signs in as someone new', async () => {
    await expect(signInAs('new')).resolves.toMatchObject({ id: 'dev-newcomer', email: 'dev-newcomer@dev.test' });
  });

  it('gives a random id to someone new, by default', async () => {
    const page = await new Promise<string>(resolve => {
      const provider = devProvider();
      const fake = {
        method: 'GET',
        url: at('/choose', { user: 'new', redirect_uri: 'http://h.test/cb' }).slice(base.length),
        headers: { host: 'h.test' },
      };
      provider(
        fake as never,
        {
          writeHead: (_s: number, headers: Record<string, string>) => {
            resolve(headers.Location ?? '');
          },
          end: () => undefined,
        } as never,
        () => undefined,
      );
    });
    expect(page).toMatch(/^http:\/\/h\.test\/cb\?code=/);
  });

  it('sends the browser back to the development server alone', async () => {
    for (const path of ['/authorize', '/choose']) {
      for (const redirect_uri of ['https://elsewhere.test/cb', 'not a url']) {
        expect((await fetch(at(path, { redirect_uri }), { redirect: 'manual' })).status).toBe(400);
      }
      expect((await fetch(at(path))).status).toBe(400);
    }
  });

  it('refuses a code not given out, or given out once already, and a token not given out', async () => {
    const chosen = await fetch(at('/choose', { user: 'dev-ada', redirect_uri: callback() }), { redirect: 'manual' });
    const back = new URL(chosen.headers.get('Location') ?? '');
    expect(back.searchParams.has('state')).toBe(false);
    const trade = () => fetch(at('/token'), { method: 'POST', body: `code=${back.searchParams.get('code') ?? ''}` });
    expect((await trade()).status).toBe(200);
    expect((await trade()).status).toBe(400);
    expect((await fetch(at('/token'), { method: 'POST' })).status).toBe(400);
    expect((await fetch(at('/userinfo'), { headers: { Authorization: 'Bearer guess' } })).status).toBe(401);
    expect((await fetch(at('/userinfo'))).status).toBe(401);
  });

  it('answers nothing else of its own, and passes every other path on', async () => {
    expect((await fetch(at('/nothing'))).status).toBe(404);
    expect(await (await fetch(`${base}/profile`)).text()).toBe('passed on');
  });

  it('passes on a request with no address', async () => {
    const passed = await new Promise<boolean>(resolve => {
      devProvider()({ headers: {} } as never, {} as never, () => {
        resolve(true);
      });
    });
    expect(passed).toBe(true);
  });
});

describe('chooserPage', () => {
  it('escapes what it is given', () => {
    const html = chooserPage({ redirectUri: 'http://h.test/"><script>', state: null });
    expect(html).not.toContain('"><script>');
    expect(html).not.toContain('state=');
  });
});
