import type { RequestEvent } from '@sveltejs/kit';

import { mockStore } from './store.js';
import { memoryLogger } from './logger.js';

export interface FakeEventOptions<P> {
  readonly params?: P;
  readonly url?: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly locals?: Partial<App.Locals>;
}

/**
 * A request event with what the catalogue's hooks and endpoints read: its URL, request, params and locals. SvelteKit
 * makes the real ones; a test needs only these, so the rest of the event is left out and the type is asserted once,
 * here.
 */
export function fakeEvent<E extends RequestEvent = RequestEvent>({
  params,
  url = 'http://catalogue.test/',
  method = 'GET',
  headers = {},
  body,
  locals = {},
}: FakeEventOptions<E['params']> = {}): E {
  const event = {
    params: params ?? {},
    url: new URL(url),
    request: new Request(url, { method, headers, ...(body !== undefined && { body }) }),
    locals: { requestId: 'request-1', store: mockStore(), log: memoryLogger(), ...locals },
  };
  return event as unknown as E;
}

/**
 * Calls an endpoint with a fake event of the type it takes.
 *
 * @param handler - The endpoint, such as a route's `GET`
 * @param options - What the event carries
 * @returns The endpoint's response
 */
export function invoke<E extends RequestEvent>(
  handler: (event: E) => Response | Promise<Response>,
  options: FakeEventOptions<E['params']> = {},
): Promise<Response> {
  return Promise.resolve(handler(fakeEvent<E>(options)));
}
