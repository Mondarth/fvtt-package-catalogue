# Architecture

The repository is a pnpm workspace: applications, each released and deployed on its own, under `apps/`, and the
libraries they share or publish under `packages/`. Each releases from the commits that change it alone, tagged
`<package name>-v<version>`. Today it holds:

`packages/catalogue-contract` (`@mondarth/fvtt-package-catalogue-contract`)
: The API's contract: a zod schema, and its type, for every request and response. Published to npm, so that clients
  validate what they receive with the schemas the catalogue validates what it sends with. It depends on zod alone, and
  runs in Node and browsers. Its type tests prove its data is what `@mondarth/fvtt-resolver` reads.

`packages/accounts-contract` (`@mondarth/accounts-contract`, private)
: The contract between the accounts and the applications that use them: who a user's token is for, what their
  subscription entitles them to, their use of a service, and signing out, as an `Accounts` interface with zod schemas for the
  accounts' internal API (`/internal/v1`). The catalogue's API depends on it alone, never on the accounts' tables: today
  `accounts/local.ts` serves it in the catalogue's own process; once the accounts are an application of their own, a
  client of that internal API takes its place. `/server` serves the internal API from an `Accounts`, as a handler of
  web `Request`s, every endpoint a POST of JSON with the caller's key in `X-Internal-Key`; `/client` is
  `httpAccounts`, an `Accounts` asking it, who and what kept a minute, failures thrown as `AccountsUnavailable`.
  Versioned and tagged, never published.

`packages/design-tokens` (`@mondarth/design-tokens`)
: Mondarth's design decisions as design tokens, and the CSS built from them that every Mondarth website styles itself
  with: see {doc}`design-system`. Published to npm, for mondarth.com, which is not in this workspace.

`packages/ui` (`@mondarth/ui`, private)
: The Svelte pieces every Mondarth application shares, so that each looks and reads as one with the others: the logo,
  the theme (`theme.css`: the design tokens, and the page's base), the top bar, the language picker, notices
  and callouts, language names (`/language`), and dates written as each reader writes them (`/dates`). Each piece takes
  its words from the application, which translates them, so the package holds no messages of its own; the
  catalogue's `TopBar`, `LanguagePicker` and `MachineTranslationNotice` are its own, giving theirs. Shipped as
  source, which each application compiles. Versioned and tagged, never published.

`apps/catalogue` (`@mondarth/fvtt-package-catalogue`, private)
: The SvelteKit 3 application, built with `@sveltejs/adapter-node`: the API, the website, and the worker. Released as
  a container image.

`apps/accounts` (`@mondarth/accounts`, private)
: Mondarth's accounts, on a subdomain of their own (`accounts.`): one sign-in to every Mondarth application, the
  profile, and the subscription each application's subscriber features need. The other applications reach them
  through `@mondarth/accounts-contract` alone. A SvelteKit 3 application, in the same languages as the catalogue,
  with the shared theme and pieces from `@mondarth/ui`, released as an image of its own (`ghcr.io/mondarth/accounts`).
  Signing in, the profile, subscriptions and payments move here from the catalogue; for now it serves its home page,
  saying so, and its health check. Its development server runs on port 5174, beside the catalogue's on 5173.

## The catalogue

```text
src/
  env.ts                    the server's environment, validated when it starts
  hooks.server.ts           wiring: the handle hook, over #lib/server/runtime
  routes/api/v2/…           the API's endpoints
  routes/healthz/           the container's health check
  routes/+page.svelte       the website: the sign-in page, or the workspace (+layout, +error)
  routes/profile/           the profile page: the nickname, what is stored, signing out, deleting the profile
  routes/privacy/           "What we store": everything signing in keeps, and why (lib/stored.ts)
  routes/developers/        the API's endpoints, for developers
  routes/sign-in/, sign-out/  starting a sign-in with a provider, and ending a session
  lib/components/           Svelte components
  lib/i18n.ts               the locales, and which are machine translated
  lib/server/
    config.ts               the environment's schemas, shared by the server and the worker
    log.ts                  JSON-lines logging
    http/                   request handling: keys, CORS, the website's locale, responses in the contract's shape
    accounts/               signing in to the website: Better Auth, its tables, handles and nicknames
    db/                     the Drizzle schema and the connection
    store/                  the store: everything read or written
    universe.ts             a set of packages and everything they need, from the store
    crawl.ts                a package's releases, from the sources, loaded from their manifests
    refresh.ts              which packages held are due to be crawled again
    runtime.ts              the server's connection, store and logger, made once
  worker/main.ts            the worker's entry point: its commands, the sources and the clients
  worker/worker.ts          the worker's jobs: crawling the queue, refreshing, Foundry VTT's builds
drizzle/                    migrations, generated by drizzle-kit
messages/                   the website's text, one file per locale
project.inlang/             Paraglide's project: the locales, and how a page's locale is chosen
```

### The store

Routes and services read and write through the `CatalogueStore` interface (`lib/server/store/types.ts`), never through
Drizzle. Its one implementation, `drizzleStore`, takes any Drizzle PostgreSQL database, so the server and worker give it
postgres.js and the tests give it PGlite. See {doc}`database`.

### Universes

`gatherUniverse` (`lib/server/universe.ts`) walks a closure the way the resolver's sources do when they load releases:
from the packages asked for, through what every version of each requires or runs in. It reads the store a level at a
time, all of a level's packages in one `releasesOfEach`, so a closure costs a few queries rather than one per package.
What the store does not hold is answered as `pending` and queued in `crawl_requests`: `request` if it was asked for,
`closure` if something asked for needs it. A package queued as `closure` and later asked for becomes `request`.

### Responses

Every endpoint answers through `respond(schema, body)`, which validates the body against the contract's schema before
sending it: the catalogue cannot send what its clients would reject. Errors go through `apiError(code, message)`. The
`handle` hook replaces anything SvelteKit itself answers under `/api/`, such as its HTML 404 page, with the contract's
error, and `endpoint()` turns an endpoint that throws into the contract's `internal` error.

### The worker

`build/worker/main.js` shares `#lib/server` but not SvelteKit, so it runs without the HTTP server. It is built by
`vite.worker.config.ts`, and has three commands: `migrate`; `run`, the deployment's long-running service; and `drain`,
which does what is due now and exits.

`createWorker` (`src/worker/worker.ts`) is given the store, a factory of HTTP clients and the sources, so its tests
stand in for the web; `main.ts` gives it `@mondarth/fvtt-resolver`'s: Foundry VTT's index, GitHub, GitLab and the
manifest URLs that relationships declare. Each job has an HTTP client with a budget of its own, sharing one cache, and
is recorded in `sync_runs`.

- **Crawling** (`lib/server/crawl.ts`) takes the next package from `crawl_requests`: asked for before needed, needed
  before due a refresh, due a refresh before warming. A package queued again keeps the most pressing of its reasons.
  The worker keeps up to `CRAWL_CONCURRENCY` crawls in hand. `nextCrawl` takes a package in a transaction, locking its
  row (`FOR UPDATE SKIP LOCKED`) and moving its `not_before` an hour on, so that no other crawl takes it: finishing
  takes it off the queue, deferring sets its own time, and one neither, as when the worker is killed mid-crawl, is
  crawled again once the hour is over. Every crawl's client fetches through one `hostLimited` fetch, which makes at
  most `CRAWL_PER_HOST` requests to a host at once, across them all.
- **Consistency** (`lib/server/consistency.ts`), once a day, in the job `consistency`: `checkConsistency`, a pure
  function, compares the catalogue's copy of the index (`listings`, delisted entries and worlds left out) with every
  package held, its releases' versions and listings, and the version its own manifest last gave
  (`consistencyInputs`). It counts what is to be put right (see `ConsistencyReport` in the contract), leaving out
  versions an override says are not releases, and queues the packages concerned, at most 500, as `refresh`. It waits
  until the copy holds the index (the refresh keeps it), without recording a run, as compared with none, everything
  would be consistent, and that day's report would say so. The report
  is kept in `consistency_reports`, and `/status` gives the latest: so `listed` against `held` shows how far warming
  has gone, and the rest how far the catalogue stands in for the index.
- **The worker's cache** (`lib/server/lru-cache.ts`) is one for the process, so that Foundry VTT's index is fetched once
  in five minutes rather than once a crawl, and in memory, keeping at most `CACHE_ENTRIES` answers (5000 by default)
  and letting go of the least recently used: crawls keep each manifest they read for as long as they may, and warming
  reads tens of thousands, so a cache without a bound would grow until the worker stopped. A manifest let go of costs
  nothing more: a release loaded is kept in the database, and not loaded again.
  The resolver's `sourceSet` lists every release the sources know, then loads each from its own
  manifest. A release newer than the newest the package's listing offers, such as midi-qol's on GitLab ahead of
  Foundry VTT's listing, is kept, marked `unlisted` (`sourceSet`'s `unlisted: 'last'`): the resolver chooses one only
  when no listed version fits. The package's own manifest, that of its newest listed release held (newest by version, not
  in the order the releases are held), is declared to the
  sources, so that the version it gives now is read: a listing's manifest URLs only load the versions it lists. That
  version, given by a manifest a listed release names that names no version, is what Foundry VTT's updater installs,
  as one its author publishes by the manifest alone, so it is listed. A release already held as loaded is kept rather than loaded again, with what the
  listing says of it now: its compatibility, and whether it is listed. A release held that no source lists now is kept
  too, as a listing may give only the newest releases, such as GitHub's newest hundred; but one held as listed that
  could never be loaded is removed, as it was only what a listing once said, such as a tag an older resolver read as
  another version (`Crawled.gone`). A release only a forge's release list gives, whose manifest cannot be loaded, is
  left out altogether, with its gap, and one held of it goes too: it is only a guess from a tag, which no client can
  place or install, and a repository of several packages, or a manifest URL another package gives that leads to one,
  makes such guesses of every other package's tags (socketlib was given every Tagmar module's). One Foundry VTT's
  listing offers is kept, failed (`loadFailed`), as the listing vouches for it. Migration `0009` removed those held
  before. Nothing is removed while a listing could not be read. Each release must pass the contract's `Release` schema, as the API would refuse to send it otherwise; one
  that does not is left out, as a gap from `contract`. The package's gaps are replaced, and what its releases require
  or run in that the catalogue does not know is queued as `closure`. A crawl that throws is deferred, with
  `attempts` counted and `not_before` doubling from a minute to a day. A crawl that could not fetch something for a
  while (`isTransient`: a host's rate limit, `429`, or failure, `5xx`, one not reached, or the budget run out) is saved
  and also deferred, so that it is crawled again within the hour rather than when next due, which may be days, its
  releases that failed so loaded then: an hour, doubling, at most `TRANSIENT_RETRIES` (5) times, before it waits its
  turn. A missing (`404`), refused (`403`) or broken (`invalid`) manifest is not tried again so.
- **Package overrides** (`lib/server/overrides.ts`) are read from `PACKAGE_OVERRIDES_FILE` when the worker starts,
  through a strict schema, so that a mistake stops it rather than being ignored. `crawlPackage` is given the package's
  override: it leaves out the versions it ignores, with their gaps, and sets `manifest` (for a release still to load)
  and `versionManifest` (for every release) from its manifest template before loading. Once, when it starts, the
  worker queues as `refresh` each package it holds that has an override, and each it holds as gone.
- **Unavailable packages** are not crawled. Before crawling, the worker reads Foundry VTT's index (from the cache) and
  the package's override: `unavailableOf` gives `gone` for an override that says so. A package the index's `status`
  marks `archived` is crawled as any other, as Foundry VTT still installs it from a manifest that names it, such as a
  dependent's `requires` (Math.js, for Monster Blocks); it is `archived` only when none of its releases loads and
  nothing failed that may succeed later. Such a package is saved with `packages.unavailable` (and `unavailable_note`),
  its releases and gaps removed; saving releases again clears it. `planRefresh` queues a package held as archived that
  the index no longer archives. `gatherUniverse` gives these packages as `unavailable` and follows none of them.
- **Core builds** come from Foundry VTT's release notes, once a day; builds held stay when they cannot be read.

- **Refreshing** (`lib/server/refresh.ts`), hourly, before the crawl, so that what it queues is crawled in the same
  pass. Foundry VTT's index (fetched through the cache, and revalidated by its ETag) gives each listed package's
  `last_updated`; a held package is queued as `refresh` when that is newer than the one read before, which is kept in
  `packages.listing_updated_at` with the title and premium flag. The index gives the time of the change; it once gave
  only the day, which is still read, as the start of that day in UTC. Never read before, a package is queued when the
  date is not older than the day it was synced, as a change given only by its day may be after the sync. A package the
  index does not list, or lists with no date, is queued once it was synced a week ago, and so is every package, on the
  index or not, as its own manifest may give a version the index does not, leaving its date as it was. The rules are
  `planRefresh`'s, a pure function. A refresh costs little: releases held as loaded are kept, so only new versions'
  manifests are fetched.
- **Own manifests** (`checkOwnManifests`), every five minutes, in the job `own-manifests`: the packages held whose own
  manifest (`ownManifest`) was last checked an hour ago (`OWN_MANIFEST_CHECK_MINUTES`) or never, at most a thousand,
  the least recently checked first (`ownChecksDue`), so each about once an hour. Each is asked of its server every
  time, revalidating with the ETag it gave, so one unchanged costs a `304`; they are asked together, within the client's
  and the host limit. The job's client has a cache of its own (`versionsOnly`), keeping only each manifest's version
  and ETag, a few hundred bytes, for up to 20,000 packages, so that the crawls passing through the worker's cache in
  the hour between do not push them out of it. A package whose manifest gives a version not held is queued as `refresh`, as one its author
  published by the manifest alone leaves the index as it was. What each check found is kept with the package
  (`saveOwnChecks`): `own_version`, `own_read_at` (when it was last read) and `own_checked_at` (when it was last tried),
  so that a client can be told how fresh what the catalogue holds is.
- **The index's copy** (`listings`, written by `saveIndex`) is kept from the same read: every entry, held or not, with
  its summary, author, tags, the systems it is for, the version it lists for each line of builds, and so on. A field of
  an entry the index gives in another shape is left out, not the entry. An entry is written only when what the index
  gives of it changes (by a hash). One the index stops listing is kept, marked `delisted_at`, unless the index lists
  fewer than half of those kept, which is more likely an index cut short. Nothing reads `listings` yet: it is the start
  of the catalogue standing in for the index.
- **Warming**: each refresh, once the index's copy is kept, queues as `warm` every package it lists, not archived or
  delisted, that the catalogue neither holds nor has queued (`unwarmed`), the most recently changed first. So the
  catalogue comes to hold the whole index before clients ask for it, and a package newly listed is warmed within the
  hour. Packages to warm are crawled last, and at most `WARM_PER_HOUR` an hour (300 by default; 0 turns warming off),
  counted by the worker as it takes them from the queue (`nextCrawl`'s `warm` option), so that the first warming of
  the whole index, about 6,700 packages, is spread over about a day rather than made at once.

## SvelteKit 3

Some of what SvelteKit 3 changed shapes the code:

- Its configuration is in `vite.config.ts`, given to the `sveltekit()` plugin; there is no `svelte.config.js`.
- `tsconfig.json` extends `$app/tsconfig`, which `svelte-kit sync` generates in `node_modules/$app`.
- `#lib` is a [subpath import](https://nodejs.org/api/packages.html#subpath-imports) in `package.json`, not an alias,
  so imports through it name the file: `#lib/server/log.js`.
- Hook types are in `@sveltejs/kit/hooks`. Parameter matchers, should a route need one, are Standard Schemas, defined
  in `src/params.ts` with `defineParams`.

(environment)=

### Signing in

The accounts (`apps/accounts`) sign visitors in with [Better Auth](https://www.better-auth.com), in
`lib/server/accounts/`, for every Mondarth application: they were the catalogue's, and moved to an application of
their own, in a database of their own, so that AIDE can share them. Their session cookie is set on the domain the
applications share (`COOKIE_DOMAIN`, Better Auth's cross-subdomain cookies), and the other applications' origins
(`APP_ORIGINS`) are trusted to send visitors to sign in, with `?next=` naming their page to come back to
(`accounts/next.ts`).

A visitor who comes to the accounts from another application, such as from the catalogue's profile menu, is offered
the way back to the page they came from, at the top of every page and beside each confirmation (a checkout done, a
refund asked for): the link to the accounts says it (`?next=`, the page, checked as a sign-in's is; `?from=`, which
application), and the accounts keep it with the session (`sessions.return_to`, `return_site` and `return_at`, by
`accounts/return-to.ts`), for the pages after that say nothing of it, such as Stripe's or Patreon's return. A page's
own address comes first, so each tab goes back to where it came from. It is kept for four hours at most, and
forgotten once taken (`/return`). The admin pages are gone to on purpose, and offer no way back.

The catalogue signs no one in. It asks the accounts' internal API (`@mondarth/accounts-contract`'s `httpAccounts`),
on the deployment's own network with its key, who a user's bearer token is for (the API) and who the website's cookies
are for (`lib/server/signed-in.ts`, the bar along the top), with what they are entitled to. It signs out through
it too (`routes/sign-out`, the profile menu's Sign out): the accounts end the session the cookies name
(`/internal/v1/sign-out`, `Accounts.signOut`) and give the `Set-Cookie` headers that clear the shared cookie, which
the catalogue sends on its own response, as a form posted from the catalogue to the accounts' own sign-out would be a
cross-site post, which SvelteKit refuses. What moved is sent on
(`lib/server/http/moved.ts`): pages, and Better Auth's endpoints, are redirected to the accounts, keeping their method
(308, or 307 for a form), all but `/sign-out`, which the catalogue serves itself; Stripe's webhook and the two endpoints a device signs in with, which follow no redirect, are
passed on to the accounts and their answer given back. The catalogue's database keeps its old copies of the accounts'
tables, declared frozen in `lib/server/db/legacy/`, so that no migration drops them until a later release does.

In the accounts:

- Better Auth answers under `/auth` (its callbacks from the providers at `/auth/callback/<provider>`), not its default
  `/api/auth`, which is the API's and needs a key. The accounts' `handle` hook (`accounts/handle.ts`) gives it those
  paths, and gives every other page of the website who is signed in, in `locals.user`; the API is never signed in to.
- Its tables (`users`, `sessions`, `accounts`, `verifications`, and the website's `audit_log`) are in `accounts/schema.ts`, migrated with the rest by
  drizzle-kit, with two of the catalogue's own on `users`: the `handle`, three words and two digits given at random
  when the profile is made, and the `nickname` the user may choose, unique whatever its case.
- The site needs no script to sign in: signing in, signing out and deleting the profile are forms posted to small
  endpoints (`routes/sign-in/[provider]`, `routes/sign-out`, `routes/profile/delete`) that call Better Auth on the
  server and pass its cookies on with a redirect.
- **The Terms and Conditions** are at `/terms` (`routes/terms`), their text in `lib/components/Terms.svelte`, in
  English, which governs: a page in another language says so above them. The text is the user's, agreed with their
  solicitor: change it only as they change the terms, word for word, with its "Last updated" date. Clause C.X.2, the
  governing law, is the user's own wording, and a test (`terms.svelte.test.ts`) holds it word for word. Every page
  links the terms and "What we store" at its foot, and the purchase consent links the terms, in a tab of their own.
- `lib/stored.ts` lists what each row of the "What we store" page covers, by column; a test checks it against the
  tables as the migrations make them, so that a column added must be added to the page too.
- **Admins** have Better Auth's admin plugin, with the website's roles and permissions (`accounts/permissions.ts`): a
  `user`, or an `admin`, who may list users, set their roles, ban them, sign them out everywhere, view the site as them
  (impersonate) for an hour at most, and read the audit log. An admin is one by their role, or by being named in
  `ADMIN_USER_IDS`, which makes the first; `locals.isAdmin` says which. The admin pages (`routes/admin/`) answer 404 to
  anyone else, and call the plugin's endpoints through `auth.api`.
- **Better Auth's hooks** (`accounts/admin-hooks.ts`) hold for every call of those endpoints, the admin pages' and
  anyone's straight to `/auth/admin/…` alike. Before: they refuse what even an admin may not do (anything an admin does,
  or deleting the profile, while viewing the site as someone; an admin's role, ban or sign-out on themselves; the role
  or ban of an admin `ADMIN_USER_IDS` names; viewing the site as another admin, which Better Auth would let those
  admins do; a role there is not), each refusal with a code the pages name (`REFUSED_<WHY>`). After: they record what
  succeeded in the audit log (`accounts/audit.ts`, the `audit_log` table), with how it was and is. The plugin's
  endpoints the website does not offer (creating users, setting passwords or other fields, removing users, revoking
  one session) are `disabledPaths`.
- A **banned** user's sign-in is refused by Better Auth, which sends the browser back to the sign-in page with
  `error=BANNED_USER` and its message as `error_description`, text anyone could put in a link. So the message is a
  notice signed with `AUTH_SECRET`, naming the user and good for ten minutes (`accounts/ban-notice.ts`); the sign-in
  page reads the ban's end and reason from the database for a notice it can verify, and for any other says only that
  the profile is banned.
- **Devices sign in** by Better Auth's `device-authorization` plugin (`accounts/device.ts`): a client the catalogue
  knows (`DEVICE_CLIENTS`, `emma-extension` for now) asks for codes, its user approves it on `routes/device`, signed
  in (the sign-in route takes `next`, a path of this site, to come back to: `accounts/next.ts`), and the client polls
  for a session's token. The session is marked with its client (`sessions.client_id`, by a `session.create` database
  hook on the token endpoint), so that the profile's list of signed-in devices can say what each is. `/auth/device/code` and `/auth/device/token` answer
  CORS for any origin, without credentials (`http/handle.ts`, `DEVICE_CORS_PATHS`), so that an extension's
  background script can call them; neither takes a cookie, and Better Auth checks the origin of any request that sends
  one. The device codes (`device_codes`) expire after ten minutes, and are deleted as a client asks for new ones. Approving or denying a
  device, and signing a user's sessions out, are refused while an admin views the site as them. The profile lists and
  ends a user's sessions from the tables itself (`AccountsStore.sessionsOf`, `endSessions`): Better Auth's own listing
  and revoking ask for a session signed in within the day, which would refuse anyone signed in for longer.
- The **audit log** records who did it, as whom (while impersonating), what, to whom, and the change. The website's own
  changes made while impersonating, such as a nickname, are recorded by the routes that make them. Deleting a profile
  keeps the entries about it, but forgets what they held of it (their before and after).
- The end-to-end tests sign in through a stand-in provider (`tests/e2e/fake-provider.ts`), offered only when
  `AUTH_TEST_PROVIDER_URL` is set. The development server has one of its own, with made-up users to choose from
  (`accounts/dev-provider.ts`, served by a Vite plugin, and offered when `import.meta.env.DEV` is set): see
  {doc}`setup`. It stands in for Patreon too, without a Patreon app (`accounts/dev-patreon.ts`, `devPatreon`), with
  made-up patrons whose pledges its page changes.

### Subscriptions

`lib/server/subscriptions/` keeps subscriptions, beside the accounts:

- **Eligibilities** (`eligibilities`, `eligibilities.ts`): what a subscription gives, as a tree. Holding one holds
  every one under it, so time on `apps` gives `catalogue` and `aide`. The accounts begin with Mondarth › Apps ›
  {Catalogue, AIDE} (migration `0004`). An eligibility's id is what the applications ask for; it never changes, and an
  eligibility is retired, never deleted. Admins add them on `/admin/eligibilities`, from a node's menu in the tree
  (`Tree` and `ContextMenu` from `@mondarth/ui`). Offers say which eligibilities they add time to
  (`offer_eligibilities`) and credits which they gave (`credit_eligibilities`); Patreon's pledge gives those in the
  `patreon_eligibilities` setting. Until the offers, the Subscription page and the contract use them, every offer and
  credit gives `catalogue`.
- **Credits** (`subscription_credits`): each a span of time a user is subscribed for, with where it came from (`grant`,
  `patreon` or `payment`), the provider, method and provider's reference of a payment, the offer it was bought by, its
  period, and the admin who granted it with their note. A user is subscribed until the latest credit ends.
  `(provider, external_ref)` is unique, so a payment its provider reports twice is credited once.
- **The credit rule** (`store.ts`): time starts at the later of now and the subscription's end, and runs for its period
  in calendar months and days (`period.ts`: twelve months from 31 January end on 31 January; one month from it, on the
  last day of February). Each change is made in a transaction that holds the user's profile (`FOR UPDATE`), so that
  two cannot start from the same end. Setting an earlier end cuts every credit back to it.
- **Offers** (`subscription_offers`): a period, a price in each currency in its minor unit (`lib/prices.ts`), the dates
  it is on sale between, when it was retired, and the payment providers it is sold through, with what each knows it by
  (`provider_refs`, such as its Stripe Product and Price). Never edited: a change is a new offer.
- **Stripe** (`stripe.ts`, the one place the Stripe SDK is used, at `STRIPE_API_VERSION`): an offer made with a price
  in `STRIPE_CURRENCY` becomes a Product, with `STRIPE_TAX_CODE`, and a Price before tax (`tax_behavior: exclusive`),
  archived as it is retired. Buying (`routes/subscription`, `?/buy`) records the buyer's consent in a checkout
  (`subscription_checkouts`: who, which offer, the session, how it stands) and sends them to a Checkout Session in
  `payment` mode with Managed Payments, Stripe the merchant of record. The webhook (`routes/webhooks/stripe`, under
  `/webhooks`, which is neither the API nor the website: no key, no session, not localised) reads each event from its
  raw body and signature into a `PaymentEvent`, and `payments.ts` applies it: a paid one credits the offer's period by
  its PaymentIntent (`provider_account` = `test` or `live`), audited as `payment.credit` by `stripe`; the others mark
  the checkout processing, failed or expired. A checkout paid, failed or expired is settled for good. Routes and tests
  use the `StripeGateway` interface; `STRIPE_API_URL` points it at the end-to-end tests' stand-in.
- **Refunds and disputes** (`charge.refunded`, `charge.dispute.*`): a refund event gives what has been refunded of the
  payment in all, and `takeBack` (`store.ts`, in one transaction holding the user and the credit) takes off the end of
  the subscription the credit's share of days for what is newly refunded, rounded down (`creditDays`, cumulative, so a
  repeated event takes nothing), recording `refunded_amount` and `refunded_at`. A dispute is `disputed` = `open`, then
  `won`, or `lost`, which takes back what remains. A buyer's request (`?/refund`, sent only from the dialog of `RefundDialog.svelte`, which
  shows the page load's `preview`) sets `refund_requested_at`, and `refund_reason` (`lib/refund-reasons.ts`) with
  `refund_reason_text` for Other. Within 14 days of buying (`withinCancellation`) the action refunds it at once through
  the gateway's `refund`, with an idempotency key of the credit and when it was asked, so it is made once; the admin
  Subscriptions page lists the rest since the credit was last refunded, with `suggestedRefund` (`refunds.ts`): the share
  of what was paid for the days not yet used, counted from the credit's own start. Refunds are made in Stripe's
  dashboard; audited `payment.refund`, `payment.dispute` and `refund.request`.
- **Patreon** (`patreon.ts`): a user with Patreon linked is subscribed while they are an active patron of
  `PATREON_CAMPAIGN_ID` pledging at least the least pledge (`catalogue_settings`, `patreon_minimum`, set on the admin
  Subscriptions page). The checker asks Patreon's identity endpoint, with memberships, using the user's token, which
  Better Auth refreshes (`getAccessToken`); it keeps the answer in `patreon_memberships` a day, and whether it subscribes
  is worked out as it is read, against the least pledge now. While Patreon cannot be asked, the last answer counts for
  72 hours more (`GRACE_MS`), asked again each time; a token Patreon no longer takes (401), or that may not read
  memberships (403, or given before the scope was asked for), stops it at once. Requests at once share one asking.
  Better Auth's account hooks (`auth.ts`) forget the answer as Patreon is linked, signed in with or linked again, and
  unlinked, never as its token is refreshed. Linking is `routes/subscription/link-patreon` (a route of its own, as it
  passes Better Auth's state cookie on with the redirect); a provider signed in with is linked to
  the profile with its email address where both have verified it (Better Auth's implicit linking, no provider trusted
  without it), and Patreon is linked as asked whatever its email (`allowDifferentEmails`), once Patreon has verified it. `PATREON_URL` points it,
  and sign-in, at the end-to-end tests' stand-in.
- **Known identities** (`accounts/identities.ts`, `known_identities`): every email address and sign-in account a
  profile was ever known by, kept as an HMAC-SHA256 under a key derived from `AUTH_SECRET`, and tied to no user, so
  that it outlives deleting the profile. They are remembered as a profile and a sign-in are made (Better Auth's
  database hooks), before a profile is deleted (`deleteUser.beforeDelete`, ahead of Better Auth deleting its sign-ins),
  and whenever they are asked of, which covers profiles made before. They make an **introductory offer** (an offer
  marked so: free, never sold through Stripe) claimable once a person, by an account never subscribed (the Subscription
  page's `claim` action, a credit of source `introductory`); and, once a dispute is lost, they **refuse purchases** by
  every account known by one of them, a new one made after deleting among them, until an admin allows them again from
  the user's page (`purchases.allow` in the audit log). Terms, Sec. B.III.5, B.IV.5, B.V.3.
- **Deleting a profile** is refused while a refund asked for is still to be made, or a payment is disputed
  (`subscriptions/deletion.ts`; Terms, Sec. B.III.4): the profile page disables its button, saying why.
- **Dispute evidence** (`accounts/access.ts`, `subscriptions/evidence.ts`): `last_sessions` keeps each user's latest
  session after it ends, by the trigger `keep_last_session` on `sessions` (migrations 0023, 0024) and by
  `AccessRecorder.seen`, which both handles call on each signed-in request, at most every ten minutes per session, with
  the address `getClientAddress()` gives (Better Auth's is only the first X-Forwarded-For value, or localhost). While a
  user has a dispute open, `record` writes `access_records`; the users recorded are the disputes open, cached a minute,
  and changed at once as `applyStripeEvent` opens (`startRecording`, seeded with the last session) or closes
  (`stopRecording`, which deletes them once none is open) one. `/admin/subscriptions/evidence/<credit>` downloads it
  all as text, audited as `dispute.evidence`.
- **Entitlement** (`entitlement.ts`): `locals.entitlement()` says whether whoever is signed in may use what a
  subscription gives (an admin always may; anyone else by credits or by Patreon, `subscribedBy`), read once a request
  and only when asked. A feature that needs it calls
  `requireEntitled` in its form actions, so that without a subscription its pages load but change nothing.
- Admins grant, set the end of and revoke subscriptions, make and retire offers, and set the least Patreon pledge, from
  the admin pages, each recorded in the audit log (`subscription.*`, `offer.*`, `patreon.minimum`).

### Who may call the API

`lib/server/http/access.ts` holds who may call which endpoint, and `http/handle.ts` applies it before any route. A
request says who is asking with an API key (`X-API-Key`) or a user's token (`Authorization: Bearer`, through Better
Auth's `bearer` plugin), never the session cookie: the runtime hands Better Auth the bearer header alone
(`runtime.ts`, `apiUsers`).

- A key's kind comes from `API_KEYS`: `module:<key>` reaches lookups alone, what the EMMA module calls
  (`MODULE_PATHS`; widened only as the module comes to call more); a key alone, every endpoint but `/me`.
- A user's token reaches `/me`, and everything else while they are entitled (`subscriptions/entitlement.ts`,
  `cachedEntitlements`, kept a minute per user); otherwise `subscription-required`, with `paidUntil`. A session an
  admin is viewing the site in is `forbidden`.
- Each key and user has `API_RATE_PER_MINUTE` requests a minute (`rateLimiter`).
- The endpoint is given `locals.caller`: the key's kind, or the user and their entitlement. `/me` answers from it.
- `lib/endpoints.ts` says who may call each endpoint for `/developers`; a test checks it against `access.ts`.

### The environment

Each application's `src/env.ts` declares its server's variables with `defineEnvVars`, each with a zod schema from its
`lib/server/config.ts`, and code reads them from `$app/env/private`. SvelteKit validates them when the server starts, **and when it builds**,
as it loads the server's modules to analyse them. The build is given placeholders (CI, the Dockerfile); the real values,
read and validated again at start-up, come from the environment the server runs in.

The catalogue's:

| Variable       | Required | Meaning                                                    |
| -------------- | -------- | ---------------------------------------------------------- |
| `DATABASE_URL` | yes      | The PostgreSQL connection string                           |
| `API_KEYS`     | yes      | The keys accepted, separated by commas; `module:<key>` for the EMMA module's |
| `API_RATE_PER_MINUTE` | no | The most API requests one key or user may make in a minute; 300 by default |
| `LOG_LEVEL`    | no       | `debug`, `info` (the default), `warn` or `error`           |
| `ACCOUNTS_URL` | yes      | The accounts' address on the deployment's network, for their internal API |
| `ACCOUNTS_KEY` | yes      | The catalogue's key to the internal API: 32 characters or more |
| `ACCOUNTS_SITE_URL` | yes | The accounts' address as visitors reach it                 |
| `MIGRATIONS_DIR` | no (worker) | Where the migrations are; `drizzle` by default      |

The accounts':

| Variable       | Required | Meaning                                                    |
| -------------- | -------- | ---------------------------------------------------------- |
| `DATABASE_URL` | yes      | Their PostgreSQL connection string                         |
| `LOG_LEVEL`    | no       | `debug`, `info` (the default), `warn` or `error`           |
| `AUTH_SECRET`  | yes      | Signs their cookies and encrypts providers' tokens: 32 characters or more |
| `SITE_URL`     | yes      | Their address as visitors reach it                         |
| `INTERNAL_API_KEYS` | yes | The other applications' keys to the internal API, separated by commas |
| `COOKIE_DOMAIN` | no      | The domain the session cookie is set on, shared by every application's subdomain |
| `APP_ORIGINS`  | no       | The other applications' origins, which visitors are sent back to once signed in |
| `AUTH_<PROVIDER>_ID`, `AUTH_<PROVIDER>_SECRET` | no | A provider's app, for `GITHUB`, `GOOGLE`, `DISCORD` and `PATREON`; each is offered only with both |
| `PATREON_CAMPAIGN_ID` | no | Mondarth's Patreon campaign, whose patrons at the least pledge are subscribed |
| `PATREON_URL` | no | Patreon's address, for the end-to-end tests' stand-in alone |
| `ADMIN_USER_IDS` | no | The user ids of admins whatever their role, separated by commas, such as the first admin |
| `AUTH_TEST_PROVIDER_URL` | no | A stand-in sign-in provider, for the end-to-end tests alone |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TAX_CODE`, `STRIPE_CURRENCY`, `STRIPE_API_URL` | no | Selling subscription time through Stripe |
| `MIGRATIONS_DIR` | no (`migrate.js`) | Where the migrations are; `drizzle` by default |

adapter-node reads its own: `PORT`, and behind a proxy `PROTOCOL_HEADER`, `HOST_HEADER`, `ADDRESS_HEADER` and
`XFF_DEPTH` (set in `deploy/compose.yaml`).

### Bundling

adapter-node bundles everything the server imports except the packages in `dependencies`. The catalogue keeps all its
libraries in `devDependencies`, so `build/` needs no `node_modules`, and the image holds none. Keep it so: a library
added to `dependencies` would be missing from the image.

### Reading the contract from its sources

The contract's `package.json` exports its TypeScript sources under the `@mondarth/fvtt-package-catalogue/source` condition, and its build
otherwise. Vite, Vitest, `tsc` and `svelte-check` in the catalogue resolve that condition, so a change to the contract
is seen at once, with no build. SvelteKit's build analysis loads some modules with Node rather than Vite, which does
not know the condition, so the catalogue's `build` builds the contract first.
