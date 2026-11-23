import type { RequestEvent } from '@sveltejs/kit';

/** What a fake request is made of. */
export interface FakeEventOptions {
  readonly url?: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
}

/**
 * A request event with what the accounts' hooks and endpoints read: its URL and request. SvelteKit gives far more; a
 * test needing more adds it.
 *
 * @param options - The request
 * @returns The event
 */
export function fakeEvent<E extends RequestEvent = RequestEvent>({
  url = 'http://accounts.test/',
  method = 'GET',
  headers = {},
  params,
}: FakeEventOptions & { readonly params?: E['params'] } = {}): E {
  const request = new Request(url, { method, headers });
  return { url: new URL(url), request, locals: {}, params: params ?? {} } as unknown as E;
}
