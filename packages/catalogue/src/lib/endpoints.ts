/**
 * The API's endpoints, as the website lists them.
 */
import {
  CORE_PATH,
  LISTING_PATH,
  LOOKUP_PATH,
  MANIFEST_PATH,
  ME_PATH,
  RECHECK_PATH,
  STATUS_PATH,
} from '@mondarth/fvtt-package-catalogue-contract';

import { m } from './paraglide/messages.js';

/**
 * Who may call an endpoint, as the server holds it (`server/http/access.ts`, which a test checks this against):
 * `module`, any key, a module's among them, or a subscriber's token; `full`, a key that is not a module's, or a
 * subscriber's token; `user`, a user's token alone, subscribed or not.
 */
export type EndpointCallers = 'module' | 'full' | 'user';

/** An endpoint of the API. */
export interface Endpoint {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  /** What it gives, in the current locale. */
  readonly summary: () => string;
  readonly callers: EndpointCallers;
}

export const ENDPOINTS: readonly Endpoint[] = [
  { method: 'POST', path: LOOKUP_PATH, summary: m.endpoint_lookup_summary, callers: 'module' },
  { method: 'GET', path: LISTING_PATH, summary: m.endpoint_listing_summary, callers: 'module' },
  { method: 'GET', path: CORE_PATH, summary: m.endpoint_core_summary, callers: 'module' },
  { method: 'POST', path: MANIFEST_PATH, summary: m.endpoint_manifest_summary, callers: 'module' },
  { method: 'POST', path: RECHECK_PATH, summary: m.endpoint_recheck_summary, callers: 'full' },
  { method: 'GET', path: STATUS_PATH, summary: m.endpoint_status_summary, callers: 'full' },
  { method: 'GET', path: ME_PATH, summary: m.endpoint_me_summary, callers: 'user' },
];

/** Who may call an endpoint, in the current locale. */
export const CALLERS: Readonly<Record<EndpointCallers, () => string>> = {
  module: m.endpoint_callers_module,
  full: m.endpoint_callers_full,
  user: m.endpoint_callers_user,
};
