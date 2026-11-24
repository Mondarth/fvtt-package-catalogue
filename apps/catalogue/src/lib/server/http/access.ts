/**
 * Who may call which endpoint of the API. An API request says who is asking with a key (`X-API-Key`) or a signed-in
 * user's token (`Authorization: Bearer`), never the website's session cookie, so that a page another site opens cannot
 * call the API as its visitor.
 *
 * - A **module's key** (`module:<key>` in `API_KEYS`) reaches what the EMMA module calls: lookups alone, which give
 *   Foundry VTT's builds too. What the module comes to need is added as it does.
 * - A **key alone** reaches every endpoint but `/me`, as every key did before keys had kinds: kept while EMMA's browser
 *   extension calls the API with one, until it signs its users in.
 * - A **user's token** reaches `/me` at any time, and every other endpoint while they may use what a subscription
 *   gives: subscribed, or an admin. Never the token of a session an admin is viewing the site as someone in.
 */
import { LOOKUP_PATH, ME_PATH } from '@mondarth/fvtt-package-catalogue-contract';

import type { ApiKeyKind } from '../config.js';

/** The endpoints a module's key reaches: those the EMMA module calls, and no more. */
export const MODULE_PATHS: ReadonlySet<string> = new Set([LOOKUP_PATH]);

/** What a key reaches: whether it may call an endpoint, by its path. */
export function keyReaches(kind: ApiKeyKind, pathname: string): boolean {
  if (pathname === ME_PATH) return false;
  return kind === 'full' || MODULE_PATHS.has(pathname);
}

/**
 * The token of an `Authorization` header, if it carries one by the bearer scheme.
 *
 * @param header - The header
 * @returns The token, or none
 */
export function bearerToken(header: string | null): string | undefined {
  const match = /^bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return match?.[1];
}
