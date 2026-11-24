/**
 * Whether whoever is signed in may use what a subscription gives: an admin always may; anyone else while subscribed,
 * by the credits that make a subscription, or by Patreon (see `patreon.ts`). What needs it is read-only without it: its
 * page loads, but what changes anything is refused (see `requireEntitled`).
 */
import { error } from '@sveltejs/kit';

import type { PatreonChecker } from './patreon.js';
import type { SubscriptionStatus, SubscriptionStore } from './store.js';

/** Whether a user is subscribed: by their credits, until when, and by Patreon. */
export interface Subscribed extends SubscriptionStatus {
  /** Whether Patreon subscribes them now. */
  readonly patreon: boolean;
}

/** Whether a user is subscribed, as of a time. */
export type SubscribedOf = (userId: string, now: Date) => Promise<Subscribed>;

/** What a page is told of the user's subscription. */
export interface Entitlement extends Subscribed {
  /** Whether they may use what a subscription gives: subscribed, by credits or Patreon, or an admin. */
  readonly entitled: boolean;
}

/**
 * Whether a user is subscribed, by their credits, and by Patreon where it is set up.
 *
 * @param store - The subscriptions
 * @param patreon - Patreon, if the catalogue offers it
 * @returns How to know it
 */
export function subscribedBy(
  store: Pick<SubscriptionStore, 'status'>,
  patreon?: Pick<PatreonChecker, 'status'>,
): SubscribedOf {
  return async (userId, now) => {
    const [status, viaPatreon] = await Promise.all([
      store.status(userId, now),
      patreon === undefined ? undefined : patreon.status(userId, { now }),
    ]);
    return { ...status, patreon: viaPatreon?.subscribed ?? false };
  };
}

/** The entitlement of what a user's subscription is. */
const entitledBy = (subscribed: Subscribed, admin: boolean): Entitlement => ({
  ...subscribed,
  entitled: admin || subscribed.active || subscribed.patreon,
});

/**
 * The entitlement of a request's user, read once however often it is asked for, and only if it is.
 *
 * @param subscribed - How to know whether a user is subscribed
 * @param userId - Who is signed in, if anyone
 * @param admin - Whether they are an admin
 * @returns What a page calls to know it
 */
export function entitlementOf(
  subscribed: SubscribedOf,
  userId: string | undefined,
  admin: boolean,
): () => Promise<Entitlement> {
  let found: Promise<Entitlement> | undefined;
  return () => {
    found ??=
      userId === undefined
        ? Promise.resolve({ paidUntil: null, active: false, patreon: false, entitled: false })
        : subscribed(userId, new Date()).then(status => entitledBy(status, admin));
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
 * @param subscribed - How to know whether a user is subscribed
 * @param isAdmin - Whether a user is an admin
 * @param now - The time now, in milliseconds since the epoch
 * @returns What the API asks
 */
export function cachedEntitlements(
  subscribed: SubscribedOf,
  isAdmin: (user: Entitled) => boolean,
  now: () => number = Date.now,
): (user: Entitled) => Promise<Entitlement> {
  const kept = new Map<string, { readonly until: number; readonly entitlement: Promise<Entitlement> }>();
  return user => {
    const at = now();
    const found = kept.get(user.id);
    if (found !== undefined && found.until > at) return found.entitlement;
    const entitlement = subscribed(user.id, new Date(at)).then(status => entitledBy(status, isAdmin(user)));
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
