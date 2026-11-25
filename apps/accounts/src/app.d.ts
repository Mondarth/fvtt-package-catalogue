import type { Auth, SignedIn } from '#lib/server/accounts/auth.js';
import type { AccessRecorder } from '#lib/server/accounts/access.js';
import type { AuditStore } from '#lib/server/accounts/audit.js';
import type { BanNotices } from '#lib/server/accounts/ban-notice.js';
import type { KnownIdentities } from '#lib/server/accounts/identities.js';
import type { AccountsStore } from '#lib/server/accounts/store.js';
import type { Entitlement } from '#lib/server/subscriptions/entitlement.js';
import type { PatreonChecker } from '#lib/server/subscriptions/patreon.js';
import type { StripeGateway } from '#lib/server/subscriptions/stripe.js';
import type { SubscriptionStore } from '#lib/server/subscriptions/store.js';
import type { Logger } from '#lib/server/log.js';

declare global {
  namespace App {
    interface Locals {
      /** Identifies the request in the logs and in error responses. */
      requestId: string;
      log: Logger;
      /** Who is signed in to the website, if anyone. */
      user: SignedIn['user'] | null;
      /** Their session. */
      session: SignedIn['session'] | null;
      /** Signing in, on the website's requests. */
      auth: Auth;
      /** The accounts' tables, on the website's requests. */
      accounts: AccountsStore;
      /** The ids of the providers the sign-in page offers, on the website's requests. */
      providers: readonly string[];
      /** The other applications' origins, which a visitor may be sent back to once signed in. */
      appOrigins: readonly string[];
      /** Whether whoever is signed in is an admin: by their role, or as `ADMIN_USER_IDS` names them. */
      isAdmin: boolean;
      /** What admins have done, on the website's requests. */
      audit: AuditStore;
      /** The users who are admins whatever their role, on the website's requests. */
      adminUserIds: readonly string[];
      /** Reads the notice a banned user's sign-in comes back with, on the website's requests. */
      banNotices: BanNotices;
      /** The identities every account was known by, against abuse, on the website's and webhooks' requests. */
      identities: KnownIdentities;
      /** Records the access of users whose payments are disputed, on the website's and webhooks' requests. */
      access: AccessRecorder;
      /** Subscriptions, on the website's requests. */
      subscriptions: SubscriptionStore;
      /** Patreon, if it is offered as a way to be subscribed. */
      patreon: PatreonChecker | undefined;
      /** Stripe, if subscription time is sold through it, on the website's and webhooks' requests. */
      stripe: StripeGateway | undefined;
      /** Whether whoever is signed in may use what a subscription gives, read when first asked. */
      entitlement: () => Promise<Entitlement>;
    }
  }
}

export {};
