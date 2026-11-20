/**
 * Patreon, as a way to be subscribed: a user with a Patreon account linked is subscribed while Patreon says they are an
 * active patron of the catalogue's campaign, pledging at least the amount the admins set. It makes no credits: it is
 * asked, with the user's own token, as they use what a subscription gives.
 *
 * - **Kept a day.** Patreon's answer is kept in `patreon_memberships` for {@link CHECK_EVERY_MS}, then asked again.
 * - **When Patreon cannot be asked,** the last answer still counts for {@link GRACE_MS} past that day, Patreon asked
 *   again each time; after that, the user is not subscribed by Patreon until it answers.
 * - **When Patreon no longer takes the token,** or the token may not read memberships, the user is not subscribed by
 *   Patreon at once, and is asked to link it again, which forgets what was kept.
 *
 * Patreon's API, version 2: `GET /api/oauth2/v2/identity`, with the user's memberships and their campaigns, for which the
 * token needs the `identity.memberships` scope.
 */
import { and, eq } from 'drizzle-orm';

import { accounts } from '../accounts/schema.js';
import { catalogueSettings, patreonMemberships } from './schema.js';

import type { Database } from '../db/database.js';
import type { PatreonFailure } from './schema.js';

/** How long Patreon's answer is kept before it is asked again. */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/** How long past that the last answer still counts while Patreon cannot be asked. */
export const GRACE_MS = 72 * 60 * 60 * 1000;

/** Patreon's provider id, as Better Auth knows it. */
export const PATREON = 'patreon';

/** Patreon's own address. */
export const PATREON_URL = 'https://www.patreon.com';

/**
 * One of Patreon's paths, at its address or a stand-in's, keeping the stand-in's own path, such as `/__dev/patreon`.
 *
 * @param base - Patreon's address
 * @param path - The path, such as `/oauth2/authorize`
 * @returns The URL
 */
export function patreonUrl(base: string, path: string): URL {
  return new URL(`${base.replace(/\/+$/, '')}${path}`);
}

/** The scopes a Patreon sign-in or link asks for: who the user is, their email, and their memberships. */
export const PATREON_SCOPES = ['identity', 'identity[email]', 'identity.memberships'] as const;

/** The setting the least pledge is kept under. */
export const MINIMUM_SETTING = 'patreon_minimum';

/** The least pledge that subscribes: an amount in a currency's minor unit, the campaign's currency. */
export interface PatreonMinimum {
  readonly currency: string;
  readonly amount: number;
}

/** A membership, as Patreon last said and when. */
export type PatreonMembership = typeof patreonMemberships.$inferSelect;

/** What Patreon's identity endpoint says of the user's membership of the campaign. */
export interface PatreonAnswer {
  readonly patronStatus: string | null;
  readonly amount: number | null;
  readonly nextChargeAt: Date | null;
}

/** A user's Patreon, as the website shows it. */
export interface PatreonStatus {
  /** Whether they have a Patreon account linked. */
  readonly linked: boolean;
  /** Whether it subscribes them now. */
  readonly subscribed: boolean;
  /** What Patreon last said, if it has been asked. */
  readonly membership: PatreonMembership | null;
}

/** Not linked, so not subscribed by Patreon. */
const UNLINKED: PatreonStatus = { linked: false, subscribed: false, membership: null };

/**
 * The user's membership of the campaign, from Patreon's identity endpoint's answer: none if they are not a member.
 *
 * @param answer - The endpoint's JSON
 * @param campaignId - The catalogue's campaign
 * @returns The membership, or `undefined` for an answer that is not the endpoint's
 */
export function readMembership(answer: unknown, campaignId: string): PatreonAnswer | undefined {
  if (typeof answer !== 'object' || answer === null || !('data' in answer)) return undefined;
  const included: unknown = (answer as { included?: unknown }).included ?? [];
  if (!Array.isArray(included)) return undefined;
  const member = included.find((item: unknown): boolean => {
    const { type, relationships } = item as {
      type?: unknown;
      relationships?: { campaign?: { data?: { id?: unknown } } };
    };
    return type === 'member' && relationships?.campaign?.data?.id === campaignId;
  }) as { attributes?: Record<string, unknown> } | undefined;
  if (member === undefined) return { patronStatus: null, amount: null, nextChargeAt: null };
  const {
    patron_status: status,
    currently_entitled_amount_cents: cents,
    next_charge_date: next,
  } = member.attributes ?? {};
  return {
    patronStatus: typeof status === 'string' ? status : null,
    amount: typeof cents === 'number' && Number.isInteger(cents) ? cents : null,
    nextChargeAt: typeof next === 'string' && !Number.isNaN(Date.parse(next)) ? new Date(next) : null,
  };
}

/**
 * Whether a membership subscribes its user now: an active patron at the least pledge or more, as Patreon last said,
 * that answer no older than a day, or, while Patreon cannot be asked, than a day and the grace.
 *
 * @param membership - What Patreon last said, if anything
 * @param minimum - The least pledge; none set, and Patreon subscribes no one
 * @param now - The time now
 * @returns Whether it subscribes them
 */
export function subscribes(membership: PatreonMembership | null, minimum: PatreonMinimum | null, now: Date): boolean {
  if (membership === null || minimum === null || membership.checkedAt === null) return false;
  if (membership.failure === 'revoked' || membership.failure === 'scope') return false;
  const age = now.getTime() - membership.checkedAt.getTime();
  if (age > CHECK_EVERY_MS + GRACE_MS) return false;
  return membership.patronStatus === 'active_patron' && (membership.amount ?? 0) >= minimum.amount;
}

/** What the checker is given. */
export interface PatreonOptions {
  readonly db: Database;
  /** The catalogue's campaign; none, and Patreon subscribes no one. */
  readonly campaignId: string | undefined;
  /** Patreon's address: its own, but for the end-to-end tests' stand-in. */
  readonly baseUrl?: string;
  /** The user's Patreon token, refreshed if it has expired; throws if it cannot be had. */
  readonly accessToken: (userId: string, accountId: string) => Promise<string>;
  readonly fetch?: typeof fetch;
}

/** Patreon, as the website and the API ask it. */
export interface PatreonChecker {
  /**
   * The user's Patreon: asked again if what was kept is a day old, or has failed, or if asked to.
   *
   * @param userId - The user
   * @param options - The time now, and whether to ask again whatever was kept
   */
  status(userId: string, options?: { readonly now?: Date; readonly force?: boolean }): Promise<PatreonStatus>;
  /** The least pledge that subscribes, if set. */
  minimum(): Promise<PatreonMinimum | null>;
  /** Sets the least pledge, or clears it, and so Patreon subscribes no one. */
  setMinimum(minimum: PatreonMinimum | null, by: string): Promise<void>;
  /** Forgets what Patreon said of a user, as when they link it again or unlink it. */
  forget(userId: string): Promise<void>;
  /** The id of the user's Patreon account, as Better Auth keeps it, if they have one linked. */
  accountOf(userId: string): Promise<string | undefined>;
  /** What was kept of the user's Patreon, without asking it: for the admin pages. */
  kept(userId: string, now?: Date): Promise<PatreonStatus>;
}

/**
 * Forget what Patreon last said of an account's user, if it is a Patreon account: Better Auth's account hooks call it.
 *
 * @param db - The database
 * @param account - The account
 * @param account.providerId - Its provider
 * @param account.userId - Its user
 */
export async function forgetPatreonOf(
  db: Database,
  account: { readonly providerId: string; readonly userId: string },
): Promise<void> {
  if (account.providerId === PATREON) {
    await db.delete(patreonMemberships).where(eq(patreonMemberships.userId, account.userId));
  }
}

/**
 * Patreon, over the database.
 *
 * @param options - The database, the campaign, and how to ask Patreon
 * @returns The checker
 */
export function patreonChecker(options: PatreonOptions): PatreonChecker {
  const { db, campaignId, baseUrl = PATREON_URL, accessToken } = options;
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  /** The askings under way, so that requests at once share one. */
  const asking = new Map<string, Promise<PatreonMembership>>();

  async function minimum(): Promise<PatreonMinimum | null> {
    const [found] = await db
      .select({ value: catalogueSettings.value })
      .from(catalogueSettings)
      .where(eq(catalogueSettings.key, MINIMUM_SETTING));
    const value = found?.value as Partial<PatreonMinimum> | undefined;
    return typeof value?.currency === 'string' && typeof value.amount === 'number'
      ? { currency: value.currency, amount: value.amount }
      : null;
  }

  async function kept(userId: string): Promise<PatreonMembership | null> {
    const [found] = await db.select().from(patreonMemberships).where(eq(patreonMemberships.userId, userId));
    return found ?? null;
  }

  async function keep(row: PatreonMembership): Promise<PatreonMembership> {
    await db
      .insert(patreonMemberships)
      .values(row)
      .onConflictDoUpdate({ target: patreonMemberships.userId, set: { ...row } });
    return row;
  }

  /** Ask Patreon, and keep what it says, or why it could not be asked. */
  async function ask(
    campaign: string,
    userId: string,
    accountId: string,
    scope: string | null,
    before: PatreonMembership | null,
    now: Date,
  ): Promise<PatreonMembership> {
    const failed = (failure: PatreonFailure) =>
      keep({
        userId,
        patronStatus: before?.patronStatus ?? null,
        amount: before?.amount ?? null,
        nextChargeAt: before?.nextChargeAt ?? null,
        checkedAt: before?.checkedAt ?? null,
        askedAt: now,
        failure,
      });
    // A token given before the catalogue asked for memberships may not read them: the user links Patreon again.
    if (!(scope ?? '').split(/[\s,]+/).includes('identity.memberships')) return failed('scope');
    let token: string;
    try {
      token = await accessToken(userId, accountId);
    } catch {
      // Refreshing the token asks Patreon too: whether it could not, or would not, the grace covers it.
      return failed('unreachable');
    }
    const url = patreonUrl(baseUrl, '/api/oauth2/v2/identity');
    url.searchParams.set('include', 'memberships.campaign');
    url.searchParams.set('fields[member]', 'patron_status,currently_entitled_amount_cents,next_charge_date');
    let response: Response;
    try {
      response = await send(url, { headers: { authorization: `Bearer ${token}` } });
    } catch {
      return failed('unreachable');
    }
    if (response.status === 401) return failed('revoked');
    if (response.status === 403) return failed('scope');
    if (!response.ok) return failed('unreachable');
    const answer = readMembership(await response.json().catch(() => undefined), campaign);
    if (answer === undefined) return failed('unreachable');
    return keep({ userId, ...answer, checkedAt: now, askedAt: now, failure: null });
  }

  /** The user's Patreon account, with the scopes it was given. */
  async function account(userId: string) {
    const [found] = await db
      .select({ id: accounts.id, scope: accounts.scope })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, PATREON)));
    return found;
  }

  return {
    async status(userId, { now = new Date(), force = false } = {}) {
      const linked = await account(userId);
      if (linked === undefined) return UNLINKED;
      let membership = await kept(userId);
      const due =
        force ||
        membership === null ||
        membership.failure === 'unreachable' ||
        now.getTime() - membership.askedAt.getTime() >= CHECK_EVERY_MS;
      if (campaignId !== undefined && due) {
        let pending = asking.get(userId);
        if (pending === undefined) {
          pending = ask(campaignId, userId, linked.id, linked.scope, membership, now).finally(() =>
            asking.delete(userId),
          );
          asking.set(userId, pending);
        }
        membership = await pending;
      }
      return {
        linked: true,
        subscribed: campaignId !== undefined && subscribes(membership, await minimum(), now),
        membership,
      };
    },

    minimum,

    async setMinimum(given, by) {
      if (given === null) {
        await db.delete(catalogueSettings).where(eq(catalogueSettings.key, MINIMUM_SETTING));
        return;
      }
      const value = { currency: given.currency, amount: given.amount };
      await db
        .insert(catalogueSettings)
        .values({ key: MINIMUM_SETTING, value, updatedBy: by })
        .onConflictDoUpdate({ target: catalogueSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
    },

    forget: userId => forgetPatreonOf(db, { providerId: PATREON, userId }),

    accountOf: async userId => (await account(userId))?.id,

    async kept(userId, now = new Date()) {
      if ((await account(userId)) === undefined) return UNLINKED;
      const membership = await kept(userId);
      return {
        linked: true,
        subscribed: campaignId !== undefined && subscribes(membership, await minimum(), now),
        membership,
      };
    },
  };
}
