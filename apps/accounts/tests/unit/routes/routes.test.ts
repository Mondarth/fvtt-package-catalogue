import { describe, expect, it } from 'vitest';

import { load } from '../../../src/routes/+layout.server.js';
import { GET as health } from '../../../src/routes/healthz/+server.js';
import { isSitePath } from '../../../src/lib/server/i18n.js';
import { fakeEvent } from '../support/event.js';

import type { LayoutServerLoadEvent } from '../../../src/routes/$types.js';
import type { RequestEvent } from '@sveltejs/kit';

describe('the health check', () => {
  it('says the server is up, never kept', async () => {
    const response = await health(fakeEvent<RequestEvent<Record<string, never>, '/healthz'>>());
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('every page', () => {
  it("is given the regional form of its language the reader's browser prefers, for dates", () => {
    const event = fakeEvent<LayoutServerLoadEvent>({ headers: { 'Accept-Language': 'en-GB,en;q=0.9' } });
    expect(load(event)).toEqual({ dateLocale: 'en-GB' });
    expect(load(fakeEvent<LayoutServerLoadEvent>())).toEqual({ dateLocale: 'en' });
  });
});

describe('the paths', () => {
  it('are pages, but for the internal API and the health check', () => {
    expect(isSitePath('/')).toBe(true);
    expect(isSitePath('/internally')).toBe(true);
    expect(isSitePath('/internal')).toBe(false);
    expect(isSitePath('/internal/v1/use')).toBe(false);
    expect(isSitePath('/healthz')).toBe(false);
  });
});
