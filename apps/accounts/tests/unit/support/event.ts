import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

import { memoryLogger } from './logger.js';

import type { KnownIdentities } from '../../../src/lib/server/accounts/identities.js';

/**
 * Known identities as a test has them by default: a person who claimed no introductory offer, and may buy.
 *
 * @param standing - Where they stand, if otherwise
 * @returns The identities, each method a spy
 */
export function noIdentities(standing: Partial<Awaited<ReturnType<KnownIdentities['standing']>>> = {}): {
  [K in keyof KnownIdentities]: Mock<KnownIdentities[K]>;
} {
  return {
    remember: vi.fn<KnownIdentities['remember']>(() => Promise.resolve([])),
    rememberThese: vi.fn<KnownIdentities['rememberThese']>(() => Promise.resolve([])),
    standing: vi.fn<KnownIdentities['standing']>(() =>
      Promise.resolve({ introductoryClaimed: false, purchasesRefusedAt: null, ...standing }),
    ),
    claimIntroductory: vi.fn<KnownIdentities['claimIntroductory']>(() => Promise.resolve()),
    refusePurchases: vi.fn<KnownIdentities['refusePurchases']>(() => Promise.resolve()),
    allowPurchases: vi.fn<KnownIdentities['allowPurchases']>(() => Promise.resolve()),
  };
}

export interface FakeEventOptions<P> {
  readonly params?: P;
  readonly url?: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly locals?: Partial<App.Locals>;
}

/**
 * A request event with what the accounts' hooks and endpoints read: its URL, request, params and locals. SvelteKit
 * makes the real ones; a test needs only these, so the rest of the event is left out and the type is asserted once,
 * here.
 */
export function fakeEvent<E extends RequestEvent = RequestEvent>({
  params,
  url = 'http://accounts.test/',
  method = 'GET',
  headers = {},
  body,
  locals = {},
}: FakeEventOptions<E['params']> = {}): E {
  const event = {
    params: params ?? {},
    url: new URL(url),
    request: new Request(url, { method, headers, ...(body !== undefined && { body }) }),
    locals: {
      requestId: 'request-1',
      log: memoryLogger(),
      identities: noIdentities(),
      ...locals,
    },
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
