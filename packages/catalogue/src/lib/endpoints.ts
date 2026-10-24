/**
 * The API's endpoints, as the website lists them.
 */
import { API_BASE, UNIVERSE_PATH } from '@mondarth/fvtt-package-catalogue-contract';

import { m } from './paraglide/messages.js';

/** An endpoint of the API. */
export interface Endpoint {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  /** What it gives, in the current locale. */
  readonly summary: () => string;
}

export const ENDPOINTS: readonly Endpoint[] = [
  { method: 'GET', path: `${API_BASE}/packages/{type}/{id}/releases`, summary: m.endpoint_releases_summary },
  { method: 'POST', path: UNIVERSE_PATH, summary: m.endpoint_universe_summary },
  { method: 'GET', path: `${API_BASE}/status`, summary: m.endpoint_status_summary },
];
