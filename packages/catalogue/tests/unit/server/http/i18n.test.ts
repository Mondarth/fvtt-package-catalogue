import { describe, expect, it, vi } from 'vitest';

import { getLocale } from '../../../../src/lib/paraglide/runtime.js';
import { handleI18n } from '../../../../src/lib/server/http/i18n.js';
import { fakeEvent } from '../../support/event.js';

import type { RequestEvent } from '@sveltejs/kit';
import type { ResolveOptions } from '@sveltejs/kit/hooks';

const PAGE = '<html lang="%paraglide.lang%" dir="%paraglide.dir%">';

/** Runs the hook for a request, giving the locale the page was rendered in and the page's opening tag. */
async function render(path: string, headers: Record<string, string> = {}) {
  let locale: string | undefined;
  let html: string | undefined;
  const resolve = vi.fn(async (_event: RequestEvent, options?: ResolveOptions) => {
    locale = getLocale();
    html = await options?.transformPageChunk?.({ html: PAGE, done: true });
    return new Response('page');
  });
  const response = await handleI18n({ event: fakeEvent({ url: `http://catalogue.test${path}`, headers }), resolve });
  return { response, resolve, locale, html };
}

describe('handleI18n', () => {
  it('renders the website in English by default, saying so in its html tag', async () => {
    const { locale, html } = await render('/');
    expect(locale).toBe('en');
    expect(html).toBe('<html lang="en" dir="ltr">');
  });

  it("renders it in the browser's preferred language", async () => {
    const { locale, html } = await render('/', { 'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8' });
    expect(locale).toBe('es');
    expect(html).toBe('<html lang="es" dir="ltr">');
  });

  it('prefers the language the visitor chose', async () => {
    const { locale } = await render('/', { 'Accept-Language': 'es', Cookie: 'PARAGLIDE_LOCALE=en' });
    expect(locale).toBe('en');
  });

  it('falls back to English for a language it does not have', async () => {
    expect((await render('/', { 'Accept-Language': 'ja' })).locale).toBe('en');
  });

  it.each(['/api/v1/status', '/healthz'])('passes %s through untouched', async path => {
    const { resolve, response } = await render(path, { 'Accept-Language': 'es' });
    expect(resolve).toHaveBeenCalledWith(expect.anything());
    expect(resolve.mock.calls[0]).toHaveLength(1);
    expect(await response.text()).toBe('page');
  });
});
