import type { HttpClient } from '@mondarth/fvtt-resolver/sources';
import type { Auth, SignedIn } from '#lib/server/accounts/auth.js';
import type { AccessRecorder } from '#lib/server/accounts/access.js';
import type { AuditStore } from '#lib/server/accounts/audit.js';
import type { ApiCaller } from '#lib/server/http/handle.js';
import type { BanNotices } from '#lib/server/accounts/ban-notice.js';
import type { AccountsStore } from '#lib/server/accounts/store.js';
import type { Entitlement } from '#lib/server/subscriptions/entitlement.js';
import type { PatreonChecker } from '#lib/server/subscriptions/patreon.js';
import type { StripeGateway } from '#lib/server/subscriptions/stripe.js';
import type { SubscriptionStore } from '#lib/server/subscriptions/store.js';
import type { Logger } from '#lib/server/log.js';
import type { SafeFetched } from '#lib/server/safe-fetch.js';
import type { CatalogueStore } from '#lib/server/store/types.js';

declare global {
  /** The catalogue's version, from package.json at build time. */
  const __CATALOGUE_VERSION__: string;

  namespace App {
    interface Locals {
      /** Identifies the request in the logs and in error responses. */
      requestId: string;
      /** Who is asking the API, by their key or their user's token, on the API's requests. */
      caller?: ApiCaller;
      store: CatalogueStore;
      log: Logger;
      /** A client for a request that fetches, such as a recheck of packages' own manifests, with a budget of its own. */
      http: () => HttpClient;
      /** Fetches a URL a client gave, refusing what only the server may reach (see `safe-fetch.ts`). */
      fetchGiven: (url: string) => Promise<SafeFetched>;
      /** Who is signed in to the website, if anyone; never on the API's requests. */
      user: SignedIn['user'] | null;
      /** Their session. */
      session: SignedIn['session'] | null;
      /** Signing in, on the website's requests. */
      auth: Auth;
      /** The accounts' tables, on the website's requests. */
      accounts: AccountsStore;
      /** The ids of the providers the sign-in page offers, on the website's requests. */
      providers: readonly string[];
      /** Whether whoever is signed in is an admin: by their role, or as `ADMIN_USER_IDS` names them. */
      isAdmin: boolean;
      /** What admins have done, on the website's requests. */
      audit: AuditStore;
      /** The users who are admins whatever their role, on the website's requests. */
      adminUserIds: readonly string[];
      /** Reads the notice a banned user's sign-in comes back with, on the website's requests. */
      banNotices: BanNotices;
      /** Records the access of users whose payments are disputed, on the website's and webhooks' requests. */
      access: AccessRecorder;
      /** Subscriptions, on the website's requests. */
      subscriptions: SubscriptionStore;
      /** Patreon, if the catalogue offers it as a way to be subscribed. */
      patreon: PatreonChecker | undefined;
      /** Stripe, if the catalogue sells subscription time through it, on the website's and webhooks' requests. */
      stripe: StripeGateway | undefined;
      /** Whether whoever is signed in may use what a subscription gives, read when first asked. */
      entitlement: () => Promise<Entitlement>;
    }
  }
}

export {};
