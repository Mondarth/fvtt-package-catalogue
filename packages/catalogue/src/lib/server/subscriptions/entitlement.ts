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
