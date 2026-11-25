/**
 * Known identities, against abuse: every email address and sign-in account an account was ever known by, kept as a
 * keyed hash (`known_identities`), tied to no user, so that what it records outlives deleting the account.
 *
 * - **An introductory offer** is claimed once a person: an account known by an identity that claimed one claims none.
 * - **Purchases refused** after a dispute was lost stay refused for every account known by one of its identities, a
 *   new one made after deleting the old among them, until an admin allows them again.
 *
 * The hash is HMAC-SHA256, keyed by a key derived from `AUTH_SECRET`, so that the identities cannot be read back, nor
 * matched without the key. Changing `AUTH_SECRET` starts them afresh. A user's identities are remembered as their
 * profile and sign-ins are made, before the profile is deleted, and whenever they are asked of (`remember`), which
 * covers profiles made before identities were kept.
 */
import { createHmac } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';

import { accounts, knownIdentities, users } from './schema.js';

import type { Database } from '../db/database.js';
import type { IdentityKind } from './schema.js';

/** What the key is derived for, so that it is this key alone, whatever else `AUTH_SECRET` keys. */
const KEY_PURPOSE = 'mondarth/known-identities/v1';

/** An identity, as it is hashed. */
export interface Identity {
  readonly kind: IdentityKind;
  readonly value: string;
}

/** Where a user stands by their identities. */
export interface IdentityStanding {
  /** Whether an account known by one of them claimed an introductory offer. */
  readonly introductoryClaimed: boolean;
  /** When purchases by one of them were first refused, if they are. */
  readonly purchasesRefusedAt: Date | null;
}

/** The known identities. */
export interface KnownIdentities {
  /** Remembers a user's identities, as they are now; gives their hashes. */
  readonly remember: (userId: string, now?: Date) => Promise<string[]>;
  /** Remembers identities given, as a profile or a sign-in is made. */
  readonly rememberThese: (identities: readonly Identity[], now?: Date) => Promise<string[]>;
  /** Where a user stands by their identities, remembered first. */
  readonly standing: (userId: string) => Promise<IdentityStanding>;
  /** Marks a user's identities as having claimed an introductory offer. */
  readonly claimIntroductory: (userId: string, now?: Date) => Promise<void>;
  /** Refuses purchases by a user's identities, after a dispute of theirs was lost. */
  readonly refusePurchases: (userId: string, now?: Date) => Promise<void>;
  /** Allows purchases by a user's identities again, as an admin decides. */
  readonly allowPurchases: (userId: string) => Promise<void>;
}

/**
 * An email address as it is hashed: trimmed, and in lower case, as the same address however it is written.
 *
 * @param email - The address
 * @returns The identity
 */
export const emailIdentity = (email: string): Identity => ({ kind: 'email', value: email.trim().toLowerCase() });

/**
 * A sign-in account as it is hashed: its provider, and its id there.
 *
 * @param providerId - The provider, such as `github`
 * @param accountId - Its id for the user
 * @returns The identity
 */
export const accountIdentity = (providerId: string, accountId: string): Identity => ({
  kind: 'account',
  value: `${providerId}:${accountId}`,
});

/**
 * Hashing identities, keyed by a key derived from a secret.
 *
 * @param secret - The secret, `AUTH_SECRET`
 * @returns The hash of an identity, hex
 */
export function identityHasher(secret: string): (identity: Identity) => string {
  const key = createHmac('sha256', secret).update(KEY_PURPOSE).digest();
  return ({ kind, value }) => createHmac('sha256', key).update(`${kind}\u0000${value}`).digest('hex');
}

/**
 * The known identities, over the database.
 *
 * @param db - The database
 * @param secret - The secret their key is derived from, `AUTH_SECRET`
 * @returns The known identities
 */
export function knownIdentitiesOf(db: Database, secret: string): KnownIdentities {
  const hash = identityHasher(secret);

  /** A user's identities, as they are now: their email address, and each sign-in account. */
  async function identitiesOf(userId: string): Promise<Identity[]> {
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    if (user === undefined) return [];
    const linked = await db
      .select({ providerId: accounts.providerId, accountId: accounts.accountId })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    return [
      emailIdentity(user.email),
      ...linked.map(({ providerId, accountId }) => accountIdentity(providerId, accountId)),
    ];
  }

  async function rememberThese(identities: readonly Identity[], now = new Date()): Promise<string[]> {
    if (identities.length === 0) return [];
    const rows = identities.map(identity => ({ hash: hash(identity), kind: identity.kind, firstSeenAt: now }));
    await db.insert(knownIdentities).values(rows).onConflictDoNothing();
    return rows.map(row => row.hash);
  }

  const remember = async (userId: string, now = new Date()) => rememberThese(await identitiesOf(userId), now);

  /** Sets a field on each of a user's identities, remembered first. */
  async function mark(userId: string, set: Partial<typeof knownIdentities.$inferInsert>, now = new Date()) {
    const hashes = await remember(userId, now);
    if (hashes.length > 0) await db.update(knownIdentities).set(set).where(inArray(knownIdentities.hash, hashes));
  }

  return {
    remember,
    rememberThese,

    async standing(userId) {
      const hashes = await remember(userId);
      if (hashes.length === 0) return { introductoryClaimed: false, purchasesRefusedAt: null };
      const found = await db.select().from(knownIdentities).where(inArray(knownIdentities.hash, hashes));
      const refused = found
        .map(row => row.purchasesRefusedAt)
        .filter((at): at is Date => at !== null)
        .sort((a, b) => a.getTime() - b.getTime());
      return {
        introductoryClaimed: found.some(row => row.introductoryClaimedAt !== null),
        purchasesRefusedAt: refused[0] ?? null,
      };
    },

    claimIntroductory: (userId, now = new Date()) => mark(userId, { introductoryClaimedAt: now }, now),
    refusePurchases: (userId, now = new Date()) => mark(userId, { purchasesRefusedAt: now }, now),
    allowPurchases: userId => mark(userId, { purchasesRefusedAt: null }),
  };
}
