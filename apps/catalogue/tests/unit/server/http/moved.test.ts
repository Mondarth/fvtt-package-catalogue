import { describe, expect, it, vi } from 'vitest';

import {
  DEVICE_CORS_HEADERS,
  MOVED_PAGES,
  createMovedHandle,
  hasMoved,
} from '../../../../src/lib/server/http/moved.js';
import { fakeEvent } from '../../support/event.js';

import type { RequestEvent } from '@sveltejs/kit';

const ACCOUNTS = 'http://accounts:3000';
const SITE = 'https://accounts.example.org';

function setUp(answer: () => Promise<Response> = () => Promise.resolve(new Response('passed', { status: 202 }))) {
  const fetching = vi.fn<typeof fetch>(answer);
  const handle = createMovedHandle({ accountsUrl: ACCOUNTS, accountsSiteUrl: SITE, fetch: fetching });
  const resolve = vi.fn<(event: RequestEvent) => Promise<Response>>(() => Promise.resolve(new Response('page')));
  const run = (path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const event = fakeEvent({ url: `https://catalogue.example.org${path}`, ...options });
    return { event, response: Promise.resolve(handle({ event, resolve })) };
  };
  return { fetching, resolve, run };
}

describe('what moved to the accounts', () => {
  it('is every page of theirs, and what is under each, and no other', () => {
    for (const page of MOVED_PAGES) {
      expect(hasMoved(page)).toBe(true);
      expect(hasMoved(`${page}/more`)).toBe(true);
    }
    expect(hasMoved('/webhooks/stripe')).toBe(true);
    for (const path of ['/', '/developers', '/api/v2/status', '/healthz', '/profiles', '/webhooks/other']) {
      expect(hasMoved(path)).toBe(false);
    }
  });

  it("leaves the catalogue's own alone, telling every page where the accounts are", async () => {
    const { resolve, run } = setUp();
    const { event, response } = run('/developers');
    expect(await (await response).text()).toBe('page');
    expect(resolve).toHaveBeenCalledOnce();
    expect(event.locals.accountsSite).toBe(SITE);
  });

  it('sends a page there for good, with its query, and a form on as it is', async () => {
    const { resolve, run } = setUp();
    const page = await run('/profile?tab=sessions').response;
    expect(page.status).toBe(308);
    expect(page.headers.get('location')).toBe(`${SITE}/profile?tab=sessions`);
    const form = await run('/sign-in/github', { method: 'POST', body: 'next=%2F' }).response;
    expect(form.status).toBe(307);
    expect(form.headers.get('location')).toBe(`${SITE}/sign-in/github`);
    // A provider's callback still registered at the catalogue, with its state.
    const callback = await run('/auth/callback/github?code=c&state=s').response;
    expect(callback.headers.get('location')).toBe(`${SITE}/auth/callback/github?code=c&state=s`);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("passes Stripe's webhook on, its body's very bytes and its signature, and gives back the answer", async () => {
    const { fetching, run } = setUp();
    const response = await run('/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': 't=1,v1=abc', 'Content-Type': 'application/json', Cookie: 'session=c1' },
      body: '{"id":"evt_1"}',
    }).response;
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('passed');
    const [url, init] = fetching.mock.calls[0] ?? [];
    expect(url).toBe(`${ACCOUNTS}/webhooks/stripe`);
    expect(init?.method).toBe('POST');
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"id":"evt_1"}');
    const headers = new Headers(init?.headers);
    expect(headers.get('stripe-signature')).toBe('t=1,v1=abc');
    // Nothing of the visitor's else, such as their cookies.
    expect(headers.has('cookie')).toBe(false);
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });

  it("passes a device's sign-in on, with the CORS any origin may call it with, answering its preflight itself", async () => {
    const { fetching, run } = setUp(() => Promise.resolve(Response.json({ device_code: 'd' })));
    const preflight = await run('/auth/device/code', { method: 'OPTIONS' }).response;
    expect(preflight.status).toBe(204);
    expect(fetching).not.toHaveBeenCalled();
    const code = await run('/auth/device/code', { method: 'POST', body: '{}' }).response;
    expect(await code.json()).toEqual({ device_code: 'd' });
    for (const [name, value] of Object.entries(DEVICE_CORS_HEADERS)) {
      expect(preflight.headers.get(name)).toBe(value);
      expect(code.headers.get(name)).toBe(value);
    }
    await run('/auth/device/token?x=1', { method: 'GET' }).response;
    expect(fetching.mock.calls[1]?.[0]).toBe(`${ACCOUNTS}/auth/device/token?x=1`);
    expect(fetching.mock.calls[1]?.[1]?.body).toBeNull();
  });

  it('says the accounts are unavailable when they cannot be reached, logging why', async () => {
    const { run } = setUp(() => Promise.reject(new TypeError('fetch failed')));
    const { event, response } = run('/auth/device/token', { method: 'POST', body: '{}' });
    const answer = await response;
    expect(answer.status).toBe(502);
    expect(await answer.json()).toEqual({ error: 'accounts-unavailable' });
    expect(answer.headers.get('access-control-allow-origin')).toBe('*');
    expect((event.locals.log as unknown as { lines: unknown[] }).lines).toContainEqual(
      expect.objectContaining({ message: 'The accounts could not be reached', path: '/auth/device/token' }),
    );
  });

  it('fetches with the global fetch by default', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    try {
      const handle = createMovedHandle({ accountsUrl: ACCOUNTS, accountsSiteUrl: SITE });
      const event = fakeEvent({ url: 'https://catalogue.example.org/webhooks/stripe', method: 'POST', body: '{}' });
      const response = await handle({ event, resolve: () => Promise.resolve(new Response('page')) });
      expect(await response.text()).toBe('ok');
    } finally {
      spy.mockRestore();
    }
  });
});
