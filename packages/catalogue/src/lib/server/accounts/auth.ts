/**
 * Signing in to the website, with Better Auth: through a sign-in provider (GitHub, for now), into a session kept in the
 * database. The API is not signed in to; it keeps its keys.
 *
 * Better Auth answers under {@link AUTH_PATH}, not its default `/api/auth`, which is the API's (see `http/paths.ts`).
 * What it stores is laid out on the website's "What we store" page (`/privacy`), which says the same as
 * `accounts/schema.ts`.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';

import { eq } from 'drizzle-orm';

import { freeHandle } from './handles.js';
import { accounts, sessions, users, verifications } from './schema.js';

import type { Database } from '../db/database.js';
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
  /** The site's address, as visitors reach it, such as `https://catalogue.example.org`. */
  readonly siteUrl: string;
  /** GitHub's app, if signing in with GitHub is offered. */
  readonly github?: ProviderApp | undefined;
  /**
   * A stand-in provider's address, for the end-to-end tests alone: it answers `/authorize`, `/token` and `/userinfo`
   * as an OAuth 2 provider does. Never set in a deployment.
   */
  readonly testProviderUrl?: string | undefined;
  /** Where handles' words are chosen from; crypto's by default. */
  readonly random?: Random | undefined;
}

/** The stand-in provider's id. */
export const TEST_PROVIDER = 'test';

/**
 * The providers a configuration offers, in the order the sign-in page shows them.
 *
 * @param options - The configuration
 * @returns Each provider's id
 */
export function signInProviders(options: Pick<AuthOptions, 'github' | 'testProviderUrl'>): string[] {
  return [
    ...(options.github === undefined ? [] : ['github']),
    ...(options.testProviderUrl === undefined ? [] : [TEST_PROVIDER]),
  ];
}

/**
 * Better Auth, set up for the website.
 *
 * @param options - The configuration
 * @returns The instance
 */
export function createAuth(options: AuthOptions) {
  const { db, github, testProviderUrl, random } = options;
  return betterAuth({
    appName: 'Mondarth',
    baseURL: options.siteUrl,
    basePath: AUTH_PATH,
    secret: options.secret,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    // There is no signing in with a password: only through a provider.
    emailAndPassword: { enabled: false },
    socialProviders: {
      ...(github !== undefined && { github: { clientId: github.clientId, clientSecret: github.clientSecret } }),
    },
    plugins:
      testProviderUrl === undefined
        ? []
        : [
            genericOAuth({
              config: [
                {
                  providerId: TEST_PROVIDER,
                  clientId: 'e2e',
                  clientSecret: 'e2e',
                  authorizationUrl: `${testProviderUrl}/authorize`,
                  tokenUrl: `${testProviderUrl}/token`,
                  userInfoUrl: `${testProviderUrl}/userinfo`,
                },
              ],
            }),
          ],
    user: {
      additionalFields: {
        // Given by the hook below, which Better Auth runs after checking what is required: the default stands in until
        // then, and never reaches the database.
        handle: { type: 'string', required: true, input: false, defaultValue: '' },
        nickname: { type: 'string', required: false, input: false },
      },
      // From the profile page, which asks first. A session older than a day must sign in again to do it.
      deleteUser: { enabled: true },
    },
    session: {
      // Signed in for 30 days, and for 30 more each day the site is used.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    account: { encryptOAuthTokens: true },
    databaseHooks: {
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
