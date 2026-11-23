/**
 * The contract between Mondarth's accounts and the applications that use them, such as the catalogue and AIDE: who a
 * user's token is for, what their subscription entitles them to, and their use of a service, which is recorded against
 * fraud while a payment of theirs is disputed.
 *
 * An application depends on {@link Accounts} alone, never on the accounts' tables. In the catalogue today it is served
 * in the same process; once the accounts are an application of their own, it is served over their internal API, whose
 * requests and responses are the schemas here, at the paths here.
 *
 * @packageDocumentation
 */
import { z } from 'zod';

/** The version of the accounts' internal API, which its paths carry. */
export const INTERNAL_API_VERSION = 1;

/** Where the accounts' internal API is, under their origin. */
export const INTERNAL_API_ROOT = `/internal/v${String(INTERNAL_API_VERSION)}`;

/** The internal API's endpoints, each taking a POST of JSON. */
export const INTERNAL_PATHS = {
  /** Who a token is for: {@link tokenUserRequest}, answered by {@link tokenUserResponse}. */
  tokenUser: `${INTERNAL_API_ROOT}/token-user`,
  /** What a user's subscription entitles them to: {@link entitlementRequest}, answered by {@link entitlementSchema}. */
  entitlement: `${INTERNAL_API_ROOT}/entitlement`,
  /** A user's use of a service: {@link useRequest}, answered with no content. */
  use: `${INTERNAL_API_ROOT}/use`,
} as const;

/** A time, sent as an ISO 8601 string with its offset, read as a `Date`. */
const isoDate = z.iso.datetime({ offset: true }).transform(value => new Date(value));

/** The user a token is for. */
export const accountUserSchema = z.object({
  id: z.string().min(1),
  handle: z.string().min(1),
  nickname: z.string().nullable(),
  /** Their role: an admin may use what a subscription gives without one. */
  role: z.enum(['user', 'admin']),
  /** Whether the token's session is one an admin is viewing the site as them in, which applications refuse. */
  impersonated: z.boolean(),
  /** The token's session. */
  sessionId: z.string().min(1).optional(),
});

/** The user a token is for. */
export type AccountUser = z.output<typeof accountUserSchema>;

/** What a user's subscription entitles them to. */
export const entitlementSchema = z.object({
  /** When the latest of their credits ends; none if there has never been one. */
  paidUntil: isoDate.nullable(),
  /** Whether their credits subscribe them now. */
  active: z.boolean(),
  /** Whether Patreon subscribes them now. */
  patreon: z.boolean(),
  /** Whether they may use what a subscription gives: subscribed, by credits or Patreon, or an admin. */
  entitled: z.boolean(),
});

/** What a user's subscription entitles them to. */
export type Entitlement = z.output<typeof entitlementSchema>;

/** A user's use of a service, from where and with what. */
export const serviceUseSchema = z.object({
  /** Through an application's API, or its website. */
  kind: z.enum(['api', 'site']),
  path: z.string().min(1),
  /** The client, as it names itself, such as `EMMA-extension/0.13.1`. */
  client: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
});

/** A user's use of a service. */
export type ServiceUse = z.output<typeof serviceUseSchema>;

/** Asks who a token is for. */
export const tokenUserRequest = z.object({ token: z.string().min(1) });

/** Who a token is for: none if it is no session's, or one that has ended. */
export const tokenUserResponse = z.object({ user: accountUserSchema.nullable() });

/** Asks what a user's subscription entitles them to. */
export const entitlementRequest = z.object({ user: accountUserSchema });

/** Tells the accounts of a user's use of a service. */
export const useRequest = z.object({ user: accountUserSchema, use: serviceUseSchema });

/** The accounts, as an application uses them. */
export interface Accounts {
  /** The user a token is for, if it is a session's that has not ended. */
  userOf(token: string): Promise<AccountUser | undefined>;
  /** What a user's subscription entitles them to now. */
  entitlement(user: AccountUser): Promise<Entitlement>;
  /**
   * Tells the accounts a user used the service: their last session is kept from it, and, while a payment of theirs is
   * disputed, it is recorded, as evidence that they know of the service and use it.
   */
  used(user: AccountUser, use: ServiceUse): Promise<void>;
}
