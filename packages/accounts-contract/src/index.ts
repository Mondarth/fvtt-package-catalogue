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

/**
 * The header an application gives its key to the internal API in. The API is reached on the deployment's own network
 * alone; the key says which application is asking, and that it may.
 */
export const INTERNAL_KEY_HEADER = 'X-Internal-Key';

/** The internal API's endpoints, each taking a POST of JSON. */
export const INTERNAL_PATHS = {
  /** Who a token is for: {@link tokenUserRequest}, answered by {@link userResponse}. */
  tokenUser: `${INTERNAL_API_ROOT}/token-user`,
  /** Who is signed in to the website by its cookies: {@link sessionUserRequest}, answered by {@link userResponse}. */
  sessionUser: `${INTERNAL_API_ROOT}/session-user`,
  /** What a user's subscription entitles them to: {@link entitlementRequest}, answered by {@link entitlementSchema}. */
  entitlement: `${INTERNAL_API_ROOT}/entitlement`,
  /** A user's use of a service: {@link useRequest}, answered with no content. */
  use: `${INTERNAL_API_ROOT}/use`,
  /** Signing out of the website by its cookies: {@link signOutRequest}, answered by {@link signOutResponse}. */
  signOut: `${INTERNAL_API_ROOT}/sign-out`,
} as const;

/** A time, sent as an ISO 8601 string with its offset, read as a `Date`, and written back as one. */
const isoDate = z.codec(z.iso.datetime({ offset: true }), z.date(), {
  decode: value => new Date(value),
  encode: date => date.toISOString(),
});

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

/**
 * Asks who is signed in by a request's cookies: its whole `Cookie` header, of which the accounts read their own session
 * cookie, shared by every Mondarth application's subdomain.
 */
export const sessionUserRequest = z.object({ cookie: z.string() });

/** Who a token, or a request's cookies, are for: none if no session's, or one that has ended. */
export const userResponse = z.object({ user: accountUserSchema.nullable() });

/** Asks what a user's subscription entitles them to. */
export const entitlementRequest = z.object({ user: accountUserSchema });

/** Tells the accounts of a user's use of a service. */
export const useRequest = z.object({ user: accountUserSchema, use: serviceUseSchema });

/** Asks the accounts to end the session a request's cookies name: its whole `Cookie` header, as to ask who it is. */
export const signOutRequest = z.object({ cookie: z.string() });

/**
 * The `Set-Cookie` headers that clear the session's cookies. The accounts set them for every Mondarth subdomain, so an
 * application sends them on its own response, and the browser forgets them for every Mondarth website.
 */
export const signOutResponse = z.object({ setCookies: z.array(z.string()) });

/** The accounts, as an application uses them. */
export interface Accounts {
  /** The user a token is for, if it is a session's that has not ended. */
  userOf(token: string): Promise<AccountUser | undefined>;
  /** Who is signed in to the website by a request's `Cookie` header, if anyone. */
  userOfSession(cookie: string): Promise<AccountUser | undefined>;
  /** What a user's subscription entitles them to now. */
  entitlement(user: AccountUser): Promise<Entitlement>;
  /**
   * Tells the accounts a user used the service: their last session is kept from it, and, while a payment of theirs is
   * disputed, it is recorded, as evidence that they know of the service and use it.
   */
  used(user: AccountUser, use: ServiceUse): Promise<void>;
  /**
   * Signs out of every Mondarth website: ends the session a request's `Cookie` header names, if any, and gives the
   * `Set-Cookie` headers that clear its cookies, for the application to send on its response.
   */
  signOut(cookie: string): Promise<readonly string[]>;
}
