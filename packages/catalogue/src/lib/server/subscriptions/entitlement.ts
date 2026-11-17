/**
 * Whether whoever is signed in may use what a subscription gives: an admin always may; anyone else while subscribed.
 * What needs it is read-only without it: its page loads, but what changes anything is refused (see `requireEntitled`).
 */
import { error } from '@sveltejs/kit';

import type { SubscriptionStatus, SubscriptionStore } from './store.js';

/** What a page is told of the user's subscription. */
export interface Entitlement extends SubscriptionStatus {
  /** Whether they may use what a subscription gives: subscribed, or an admin. */
  readonly entitled: boolean;
}

/**
 * The entitlement of a request's user, read once however often it is asked for, and only if it is.
 *
 * @param store - The subscriptions
 * @param userId - Who is signed in, if anyone
 * @param admin - Whether they are an admin
 * @returns What a page calls to know it
 */
export function entitlementOf(
  store: SubscriptionStore,
  userId: string | undefined,
  admin: boolean,
): () => Promise<Entitlement> {
  let found: Promise<Entitlement> | undefined;
  return () => {
    found ??=
      userId === undefined
        ? Promise.resolve({ paidUntil: null, active: false, entitled: false })
        : store.status(userId).then(status => ({ ...status, entitled: admin || status.active }));
    return found;
  };
}

/**
 * Refuses a change that needs a subscription, for a user without one: a form action of a subscription's feature
 * calls it before it changes anything, so that the feature is read-only without one.
 *
 * @param entitlement - The request's entitlement
 * @throws {HttpError} 403, if the user may not
 */
export async function requireEntitled(entitlement: () => Promise<Entitlement>): Promise<void> {
  if (!(await entitlement()).entitled) error(403, 'A subscription is needed');
}

/** A user, as far as their entitlement goes. */
export interface Entitled {
  readonly id: string;
  readonly role?: string | null | undefined;
}

/** How long a user's entitlement is kept before it is read again, in milliseconds: a revocation takes this long. */
export const ENTITLEMENT_CACHE_MS = 60_000;

/** The most users whose entitlement is kept at once; the oldest goes first. */
const CACHED_USERS = 10_000;

/**
 * Entitlements for the API, each kept for {@link ENTITLEMENT_CACHE_MS}, so that a client's every request does not read
 * its user's subscription.
 *
 * @param store - The subscriptions
 * @param isAdmin - Whether a user is an admin
 * @param now - The time now, in milliseconds since the epoch
 * @returns What the API asks
 */
export function cachedEntitlements(
  store: SubscriptionStore,
  isAdmin: (user: Entitled) => boolean,
  now: () => number = Date.now,
): (user: Entitled) => Promise<Entitlement> {
  const kept = new Map<string, { readonly until: number; readonly entitlement: Promise<Entitlement> }>();
  return user => {
    const at = now();
    const found = kept.get(user.id);
    if (found !== undefined && found.until > at) return found.entitlement;
    const entitlement = store
      .status(user.id, new Date(at))
      .then(status => ({ ...status, entitled: isAdmin(user) || status.active }));
    kept.delete(user.id);
    if (kept.size >= CACHED_USERS) {
      // A Map keeps the order of insertion: the first key is the oldest.
      const [oldest] = kept.keys();
      // A full map has a first key.
      /* v8 ignore next */
      if (oldest !== undefined) kept.delete(oldest);
    }
    kept.set(user.id, { until: at + ENTITLEMENT_CACHE_MS, entitlement });
    return entitlement;
  };
}
