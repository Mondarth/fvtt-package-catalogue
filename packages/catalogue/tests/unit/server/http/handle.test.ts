import { describe, expect, it, vi } from 'vitest';

import { CORS_HEADERS, createHandle } from '../../../../src/lib/server/http/handle.js';
import { fakeEvent } from '../../support/event.js';
import { memoryLogger } from '../../support/logger.js';
import { mockStore } from '../../support/store.js';

import type { RequestEvent } from '@sveltejs/kit';

const store = mockStore();

function setUp() {
  const log = memoryLogger();
  let tick = 0;
  const handle = createHandle({ store, apiKeys: ['secret'], log, requestId: () => 'id-1', clock: () => (tick += 5) });
  const resolve = vi.fn<(event: RequestEvent) => Promise<Response>>(() => Promise.resolve(Response.json({ ok: true })));
  const run = (url: string, options: { method?: string; headers?: Record<string, string> } = {}) => {
    const event = fakeEvent({ url: `http://catalogue.test${url}`, ...options });
    return { event, response: Promise.resolve(handle({ event, resolve })) };
  };
  return { log, resolve, run };
}

describe('createHandle', () => {
  it('gives every request an id, the store and a logger', async () => {
    const { run } = setUp();
    const { event, response } = run('/');
    await response;
    expect(event.locals.requestId).toBe('id-1');
    expect(event.locals.store).toBe(store);
  });

  it('logs each request once, with its id, status and time', async () => {
    const { log, run } = setUp();
    await run('/api/v1/status', { headers: { 'X-API-Key': 'secret', 'X-Catalogue-Client': 'EMMA/0.6.0' } }).response;
    expect(log.lines).toEqual([
      expect.objectContaining({
        message: 'request',
        requestId: 'id-1',
        method: 'GET',
        path: '/api/v1/status',
        status: 200,
        ms: 5,
        client: 'EMMA/0.6.0',
      }),
    ]);
  });

  it('serves the website without a key or CORS headers', async () => {
    const { resolve, run } = setUp();
    const response = await run('/').response;
    expect(resolve).toHaveBeenCalledOnce();
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('answers the CORS preflight without a key', async () => {
    const { resolve, run } = setUp();
    const response = await run('/api/v1/status', { method: 'OPTIONS' }).response;
    expect(response.status).toBe(204);
    expect(Object.fromEntries(response.headers)).toMatchObject(
      Object.fromEntries(Object.entries(CORS_HEADERS).map(([name, value]) => [name.toLowerCase(), value])),
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it('lets other origins post, as the universe is asked for', () => {
    expect(CORS_HEADERS['Access-Control-Allow-Methods']?.split(', ')).toEqual(['GET', 'POST', 'OPTIONS']);
  });

  it.each([
    ['no key', {}],
    ['an empty key', { 'X-API-Key': '' }],
    ['a wrong key', { 'X-API-Key': 'guess' }],
  ])('refuses an API request with %s, readably from any origin', async (_label, headers) => {
    const { resolve, run } = setUp();
    const response = await run('/api/v1/status', { headers }).response;
    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({
      error: { code: 'unauthorised', message: 'A valid X-API-Key header is needed', requestId: 'id-1' },
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('serves an API request with a key, with CORS headers', async () => {
    const { run } = setUp();
    const response = await run('/api/v1/status', { headers: { 'X-API-Key': 'secret' } }).response;
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('treats only paths under the API base as the API', async () => {
    const { resolve, run } = setUp();
    const response = await run('/api/v1beta').response;
    expect(response.status).toBe(200);
    expect(resolve).toHaveBeenCalledOnce();
  });

  // Regression: SvelteKit answered an API path no route matches with its HTML error page.
  it.each([
    [404, 'not-found'],
    [405, 'method-not-allowed'],
    [410, 'bad-request'],
    [500, 'internal'],
    [503, 'internal'],
  ])("answers SvelteKit's own %i under the API in the contract's shape", async (status, code) => {
    const { resolve, run } = setUp();
    resolve.mockResolvedValueOnce(
      new Response('<!doctype html>', { status, headers: { 'Content-Type': 'text/html' } }),
    );
    const response = await run('/api/v1/nope', { headers: { 'X-API-Key': 'secret' } }).response;
    expect(response.status).toBe({ 410: 400, 503: 500 }[status] ?? status);
    expect(await response.json()).toMatchObject({ error: { code, requestId: 'id-1' } });
  });

  it('makes a new random id for each request by default', async () => {
    const handle = createHandle({ store, apiKeys: ['secret'], log: memoryLogger() });
    const ids = await Promise.all(
      [1, 2].map(async () => {
        const event = fakeEvent();
        await handle({ event, resolve: () => Promise.resolve(new Response()) });
        return event.locals.requestId;
      }),
    );
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
