/**
 * The API's endpoints, as the website lists them.
 */
import {
  CORE_PATH,
  LISTING_PATH,
  LOOKUP_PATH,
  MANIFEST_PATH,
  RECHECK_PATH,
  STATUS_PATH,
} from '@mondarth/fvtt-package-catalogue-contract';

import { m } from './paraglide/messages.js';

/** An endpoint of the API. */
export interface Endpoint {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  /** What it gives, in the current locale. */
  readonly summary: () => string;
}

export const ENDPOINTS: readonly Endpoint[] = [
  { method: 'POST', path: LOOKUP_PATH, summary: m.endpoint_lookup_summary },
  { method: 'GET', path: LISTING_PATH, summary: m.endpoint_listing_summary },
  { method: 'GET', path: CORE_PATH, summary: m.endpoint_core_summary },
  { method: 'POST', path: RECHECK_PATH, summary: m.endpoint_recheck_summary },
  { method: 'POST', path: MANIFEST_PATH, summary: m.endpoint_manifest_summary },
  { method: 'GET', path: STATUS_PATH, summary: m.endpoint_status_summary },
];
