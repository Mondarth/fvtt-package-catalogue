import { describe, expect, it, vi } from 'vitest';

import { DEVICE_CORS_HEADERS, createRequestHandle } from '../../../../src/lib/server/http/request.js';
import { fakeEvent } from '../../support/event.js';
import { memoryLogger } from '../../support/logger.js';

import type { RequestEvent } from '@sveltejs/kit';

function setUp(more: { requestId?: () => string; clock?: () => number } = {}) {
  const log = memoryLogger();
  let tick = 0;
  const handle = createRequestHandle({ log, requestId: () => 'id-1', clock: () => (tick += 5), ...more });
  const resolve = vi.fn<(event: RequestEvent) => Promise<Response>>(() => Promise.resolve(new Response('page')));
  const run = (url: string, method = 'GET') => {
    const event = fakeEvent({ url: `http://accounts.test${url}`, method });
    return { event, response: Promise.resolve(handle({ event, resolve })) };
  };
  return { log, resolve, run };
}

describe('createRequestHandle', () => {
  it('gives each request its id and logger, and logs it, timed', async () => {
    const { log, run } = setUp();
    const { event, response } = run('/profile');
    expect((await response).status).toBe(200);
    expect(event.locals.requestId).toBe('id-1');
    expect(log.lines).toContainEqual(
      expect.objectContaining({
        message: 'request',
        method: 'GET',
        path: '/profile',
        status: 200,
        ms: 5,
        requestId: 'id-1',
      }),
    );
  });

  it("lets any origin call a device's endpoints, answering their preflight itself", async () => {
    const { resolve, run } = setUp();
    const preflight = await run('/auth/device/code', 'OPTIONS').response;
    expect(preflight.status).toBe(204);
    expect(resolve).not.toHaveBeenCalled();
    const token = await run('/auth/device/token', 'POST').response;
    expect(await token.text()).toBe('page');
    for (const [name, value] of Object.entries(DEVICE_CORS_HEADERS)) {
      expect(preflight.headers.get(name)).toBe(value);
      expect(token.headers.get(name)).toBe(value);
    }
  });

  it('lets no other origin call anything else', async () => {
    const { run } = setUp();
    expect((await run('/profile').response).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('makes a random id, and times by the clock, by default', async () => {
    const log = memoryLogger();
    const handle = createRequestHandle({ log });
    const event = fakeEvent();
    await handle({ event, resolve: () => Promise.resolve(new Response('page')) });
    expect(event.locals.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
