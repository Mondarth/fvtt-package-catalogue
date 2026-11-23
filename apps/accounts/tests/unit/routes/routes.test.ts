import { describe, expect, it } from 'vitest';

import { GET as health } from '../../../src/routes/healthz/+server.js';
import { isSitePath } from '../../../src/lib/server/http/paths.js';
import { fakeEvent } from '../support/event.js';

import type { RequestEvent } from '@sveltejs/kit';

describe('the health check', () => {
  it('says the server is up, never kept', async () => {
    const response = await health(fakeEvent<RequestEvent<Record<string, never>, '/healthz'>>());
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('the paths', () => {
  it("are pages, but for the internal API's, the health check, and webhooks", () => {
    expect(isSitePath('/')).toBe(true);
    expect(isSitePath('/internally')).toBe(true);
    expect(isSitePath('/internal')).toBe(false);
    expect(isSitePath('/internal/v1/use')).toBe(false);
    expect(isSitePath('/healthz')).toBe(false);
    expect(isSitePath('/webhooks/stripe')).toBe(false);
  });
});
