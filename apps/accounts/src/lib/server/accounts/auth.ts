/**
 * Signing in to the website, with Better Auth: through a sign-in provider (GitHub, Google, Discord or Patreon), into a
 * session kept in the database. The API is not signed in to; it keeps its keys. Admins have Better Auth's admin
 * plugin, with the website's roles (`permissions.ts`), and its hooks (`admin-hooks.ts`), which refuse what even an
 * admin may not do and record what admins did.
 *
 * Better Auth answers under {@link AUTH_PATH}, not its default `/api/auth`, which is the API's (see `http/paths.ts`).
 * What it stores is laid out on the website's "What we store" page (`/privacy`), which says the same as
 * `accounts/schema.ts`.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { bearer } from 'better-auth/plugins/bearer';
import { deviceAuthorization } from 'better-auth/plugins/device-authorization';
import { genericOAuth, patreon } from 'better-auth/plugins/generic-oauth';

import { accountIdentity, emailIdentity } from './identities.js';
import { forgetPatreonOf, PATREON_SCOPES, PATREON_URL, patreonUrl } from '../subscriptions/patreon.js';

import { eq } from 'drizzle-orm';

import { adminHooks, DISABLED_ADMIN_PATHS } from './admin-hooks.js';
import { banNotices } from './ban-notice.js';
import { DEVICE_CODE_LIFETIME, DEVICE_POLL_INTERVAL, DEVICE_TOKEN_PATH, isDeviceClient } from './device.js';
import { freeHandle } from './handles.js';
import { ac, roles } from './permissions.js';
import { accounts, deviceCodes, sessions, users, verifications } from './schema.js';

import type { KnownIdentities } from './identities.js';
import type { Database } from '../db/database.js';
import type { AuditStore } from './audit.js';
import type { Random } from './handles.js';

/** Where Better Auth answers: its callbacks from the providers are at `/auth/callback/<provider>`. */
export const AUTH_PATH = '/auth';

/** A provider's app, registered with it for this site. */
export interface ProviderApp {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** What signing in is set up with. */
export interface AuthOptions {
  readonly db: Database;
  /** Signs the cookies and encrypts the providers' tokens: at least 32 characters, and kept secret. */
  readonly secret: string;
  /** The accounts' address, as visitors reach it, such as `https://accounts.example.org`. */
  readonly siteUrl: string;
  /**
   * The domain the session cookie is set on, so that every Mondarth application's subdomain is signed in by it, such as
   * `example.org`; none, and it is the accounts' host's alone, as in development, where the applications share a host.
   */
  readonly cookieDomain?: string | undefined;
  /**
   * The other applications' origins, such as `https://catalogue.example.org`: a visitor may be sent back to them once
   * signed in, and their pages may post to the accounts.
   */
  readonly appOrigins?: readonly string[] | undefined;
  /** GitHub's app, if signing in with GitHub is offered. */
  readonly github?: ProviderApp | undefined;
  /** Google's, if signing in with Google is offered. */
  readonly google?: ProviderApp | undefined;
  /** Discord's, if signing in with Discord is offered. */
  readonly discord?: ProviderApp | undefined;
  /** Patreon's, if signing in with Patreon, and linking it, are offered. */
  readonly patreon?: ProviderApp | undefined;
  /** Patreon's address: its own by default, or the end-to-end tests' stand-in for it. */
  readonly patreonUrl?: string | undefined;
  /**
   * A stand-in provider's address, for the end-to-end tests alone: it answers `/authorize`, `/token` and `/userinfo`
   * as an OAuth 2 provider does. Never set in a deployment.
   */
  readonly testProviderUrl?: string | undefined;
  /** Where handles' words are chosen from; crypto's by default. */
  readonly random?: Random | undefined;
  /** The users who are admins whatever their role, from `ADMIN_USER_IDS`: how the first admin is made. */
  readonly adminUserIds?: readonly string[] | undefined;
  /** Where what admins do is recorded. */
  readonly audit: AuditStore;
  /** The identities every account was known by, remembered as profiles and sign-ins are made, and before deleting. */
  readonly identities?: KnownIdentities | undefined;
}

/** How long an admin may view the site as someone else, in seconds, before they are themselves again. */
export const IMPERSONATION_SECONDS = 60 * 60;

/** The stand-in provider's id. */
export const TEST_PROVIDER = 'test';

/** The real providers, in the order the sign-in page shows them. */
export const PROVIDERS = ['github', 'google', 'discord', 'patreon'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Each provider's app, where it is set up. */
export type ProviderApps = Partial<Record<Provider, ProviderApp | undefined>>;

/**
 * The providers a configuration offers, in the order the sign-in page shows them.
 *
 * @param options - The configuration
 * @returns Each provider's id
 */
export function signInProviders(options: ProviderApps & Pick<AuthOptions, 'testProviderUrl'>): string[] {
  return [
    ...PROVIDERS.filter(provider => options[provider] !== undefined),
    ...(options.testProviderUrl === undefined ? [] : [TEST_PROVIDER]),
  ];
}

/**
 * A provider's app, from its id and secret as the environment gives them.
 *
 * @param clientId - Its client id
 * @param clientSecret - Its client secret
 * @returns The app, or none unless both are given
 */
export function providerApp(clientId: string | undefined, clientSecret: string | undefined): ProviderApp | undefined {
  return clientId !== undefined && clientSecret !== undefined ? { clientId, clientSecret } : undefined;
}

/** A provider's app as Better Auth takes it, keeping nothing else of the configuration. */
const appOf = ({ clientId, clientSecret }: ProviderApp) => ({ clientId, clientSecret });

/**
 * Patreon, as Better Auth's helper sets it up, at Patreon's address or a stand-in's, asking for the user's memberships
 * as well as who they are, so that the catalogue can tell whether they are a patron (see `subscriptions/patreon.ts`).
 *
 * @param app - Patreon's app
 * @param base - Patreon's address
 * @returns The provider
 */
export function patreonProvider(app: ProviderApp, base = PATREON_URL) {
  return {
    ...patreon({ ...appOf(app), scopes: [...PATREON_SCOPES] }),
    authorizationUrl: patreonUrl(base, '/oauth2/authorize').href,
    tokenUrl: patreonUrl(base, '/api/oauth2/token').href,
    async getUserInfo(tokens: { accessToken?: string | undefined }) {
      const url = patreonUrl(base, '/api/oauth2/v2/identity');
      url.searchParams.set('fields[user]', 'email,full_name,image_url,is_email_verified');
      const response = await fetch(url, { headers: { authorization: `Bearer ${tokens.accessToken ?? ''}` } });
      if (!response.ok) return null;
      const { data } = (await response.json()) as {
        data: {
          id: string;
          attributes: { email?: string; full_name?: string; image_url?: string; is_email_verified?: boolean };
        };
      };
      return {
        id: data.id,
        name: data.attributes.full_name ?? '',
        email: data.attributes.email,
        image: data.attributes.image_url,
        emailVerified: data.attributes.is_email_verified ?? false,
      };
    },
  };
}

/**
 * Better Auth, set up for the website.
 *
 * @param options - The configuration
 * @returns The instance
 */
export function createAuth(options: AuthOptions) {
  const { db, github, google, discord, testProviderUrl, random, audit } = options;
  const notices = banNotices(options.secret);
  const adminUserIds = [...(options.adminUserIds ?? [])];
  const generic = [
    ...(options.patreon === undefined ? [] : [patreonProvider(options.patreon, options.patreonUrl)]),
    ...(testProviderUrl === undefined
      ? []
      : [
          {
            providerId: TEST_PROVIDER,
            clientId: 'e2e',
            clientSecret: 'e2e',
            authorizationUrl: `${testProviderUrl}/authorize`,
            tokenUrl: `${testProviderUrl}/token`,
            userInfoUrl: `${testProviderUrl}/userinfo`,
          },
        ]),
  ];
  return betterAuth({
    appName: 'Mondarth',
    baseURL: options.siteUrl,
    basePath: AUTH_PATH,
    secret: options.secret,
    trustedOrigins: [...(options.appOrigins ?? [])],
    // One session cookie for every application's subdomain, where they have a domain to share.
    ...(options.cookieDomain !== undefined && {
      advanced: { crossSubDomainCookies: { enabled: true, domain: options.cookieDomain } },
    }),
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        deviceCode: deviceCodes,
      },
    }),
    // There is no signing in with a password: only through a provider.
    emailAndPassword: { enabled: false },
    socialProviders: {
      ...(github !== undefined && { github: appOf(github) }),
      ...(google !== undefined && { google: appOf(google) }),
      ...(discord !== undefined && { discord: appOf(discord) }),
    },
    // A tuple, not a list spread together, so that Better Auth's types know each plugin's fields, such as `role`.
    plugins: [
      // Patreon is not among Better Auth's own providers, and the stand-in is no one's: both come through its plugin,
      // which has nothing to do where neither is set up.
      genericOAuth({ config: generic }),
      admin({
        ac,
        roles,
        defaultRole: 'user',
        adminUserIds,
        impersonationSessionDuration: IMPERSONATION_SECONDS,
        // Sent back to the sign-in page as the error's description: a signed notice naming the user, from which the
        // page reads why they are banned (see `ban-notice.ts`), never text of its own.
        bannedUserMessage: user => notices.make(user.id),
      }),
      // A session's token, as `Authorization: Bearer`, for the API (see `http/access.ts`).
      bearer(),
      // Signing a device in, such as EMMA's browser extension (see `device.ts`).
      deviceAuthorization({
        expiresIn: DEVICE_CODE_LIFETIME,
        interval: DEVICE_POLL_INTERVAL,
        validateClient: isDeviceClient,
        verificationUri: '/device',
      }),
    ],
    disabledPaths: DISABLED_ADMIN_PATHS,
    hooks: adminHooks({ db, audit, adminUserIds }),
    user: {
      additionalFields: {
        // Given by the hook below, which Better Auth runs after checking what is required: the default stands in until
        // then, and never reaches the database.
        handle: { type: 'string', required: true, input: false, defaultValue: '' },
        nickname: { type: 'string', required: false, input: false },
      },
      // From the profile page, which asks first. A session older than a day must sign in again to do it. Their
      // identities are remembered first, before Better Auth deletes their sign-in accounts, as what an account was known
      // by outlives it.
      deleteUser: {
        enabled: true,
        beforeDelete: async user => {
          await options.identities?.remember(user.id);
        },
      },
    },
    session: {
      // Signed in for 30 days, and for 30 more each day the site is used.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        // Set by the hook below for a device's session: never from what a client sends.
        clientId: { type: 'string', required: false, input: false },
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        // Signing in: a provider not yet linked is linked to the profile with the very address it gives, where the
        // provider has verified it (Google's word, Discord's and GitHub's for a verified address, Patreon's
        // `is_email_verified`) and the profile has too; otherwise it is refused (`account_not_linked`). A different
        // address finds no profile, and makes one of its own. No provider is trusted without its word, so that no one
        // can take a profile by an address they never proved.
        enabled: true,
        // Linking while signed in alone, as from the Subscription page for Patreon (`/auth/link-social` and its
        // callback): the provider may give another address than the profile's, so long as it has verified it. It
        // needs the profile's own session, so it links nothing to anyone else's, and plays no part in signing in.
        allowDifferentEmails: true,
      },
    },
    databaseHooks: {
      account: {
        // What Patreon last said of a user is forgotten as their Patreon is linked, signed in with or linked again, and
        // unlinked, so that it is asked afresh: never as its token is merely refreshed, to ask it.
        create: {
          after: async account => {
            await options.identities?.rememberThese([accountIdentity(account.providerId, account.accountId)]);
            await forgetPatreonOf(db, account);
          },
        },
        update: {
          after: (account, ctx) =>
            ctx?.path === undefined || ctx.path.startsWith('/callback/') || ctx.path.startsWith('/oauth2/callback/')
              ? forgetPatreonOf(db, account)
              : Promise.resolve(),
        },
        delete: { after: account => forgetPatreonOf(db, account) },
      },
      session: {
        create: {
          // A device's session, given by the device grant's token endpoint, is marked with its client, which the
          // endpoint has checked is one that may sign in so.
          before: (session, ctx) => {
            const clientId: unknown = (ctx?.body as { client_id?: unknown } | undefined)?.client_id;
            return Promise.resolve(
              ctx?.path === DEVICE_TOKEN_PATH && isDeviceClient(clientId)
                ? { data: { ...session, clientId } }
                : undefined,
            );
          },
        },
      },
      user: {
        create: {
          // Each new profile is given a handle no one else has.
          before: async user => {
            const handle = await freeHandle(async candidate => {
              const [found] = await db.select({ id: users.id }).from(users).where(eq(users.handle, candidate)).limit(1);
              return found !== undefined;
            }, random);
            return { data: { ...user, handle } };
          },
          after: async user => {
            await options.identities?.rememberThese([emailIdentity(user.email)]);
          },
        },
        delete: {
          // The audit log keeps who did what to them, but nothing it held of them.
          after: async user => {
            await audit.forget(user.id);
          },
        },
      },
    },
    telemetry: { enabled: false },
  });
}

/** Better Auth, as the website uses it. */
export type Auth = ReturnType<typeof createAuth>;

/** Who is signed in, and their session. */
export type SignedIn = Auth['$Infer']['Session'];
