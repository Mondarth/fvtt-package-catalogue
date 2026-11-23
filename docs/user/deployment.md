# Deploying it

The catalogue runs as containers: its server, the worker that fills its database, a PostgreSQL database, and a one-shot
migration that brings the database's schema up to date before the server and the worker start. `deploy/compose.yaml`
runs all four beside an existing
[SWAG](https://docs.linuxserver.io/general/swag/) container, which serves the catalogue over HTTPS.

```{mermaid}
flowchart LR
    client["EMMA, pdt"] -- HTTPS --> swag["SWAG"]
    subgraph swagnet ["SWAG's network"]
      swag
      app
    end
    swag -- "http://fvtt-package-catalogue:3000" --> app["app (server)"]
    subgraph database ["database network (internal)"]
      app
      migrate["migrate (one-shot)"]
      worker
      db[(PostgreSQL)]
    end
    app --> db
    migrate --> db
    worker --> db
    subgraph egress ["egress network"]
      worker
    end
    worker -- HTTPS --> web["Foundry VTT, GitHub, GitLab"]
```

Only the server joins SWAG's network, and only the worker joins `egress`, the network with a way out, to fetch
packages. The database is on a network of its own, marked `internal`, so it cannot be reached from SWAG's network and
has no way out. Nothing is published on the host.

## Setting up

1. Copy `deploy/compose.yaml` and `deploy/.env.example` (at the release's tag) to the host, and the latter to `.env`.
2. In `.env`, set:

   `SWAG_NETWORK`
   : The Docker network SWAG is on: see `docker network ls`. With SWAG in its own compose project, it is usually
     `swag_default`.

   `POSTGRES_PASSWORD`
   : The database's password. It goes into a connection URL, so keep to URL-safe characters: `openssl rand -hex 32`.

   `API_KEYS`
   : The keys clients present, separated by commas (`openssl rand -hex 32`). A key listed as `module:<key>` reaches
     only lookups, what the EMMA module calls; a key without the prefix reaches every endpoint. Give the prefix only
     to a key the module alone is built with: while EMMA's module and browser extension share a key, as releases
     before the extension signs its users in do, list it without the prefix, since the extension calls the listing,
     manifests and rechecks too. See [the API](api.md#who-is-asking).

   `API_RATE_PER_MINUTE` (optional)
   : The most API requests one key or user may make in a minute; 300 by default.

   `CATALOGUE_TAG`
   : The release to run: a version (`0.1.0`), its line (`0.1`, `0`) or `latest`.

   `AUTH_SECRET`
   : Signs the website's cookies and encrypts what sign-in providers give (`openssl rand -hex 32`). Keep it secret,
     and keep it the same: changing it signs everyone out, and the providers' tokens already stored can no longer be
     read.

   `SITE_URL`
   : The website's address as visitors reach it through SWAG, such as `https://catalogue.example.org`. Sign-in
     providers send visitors back to it.

   `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `AUTH_PATREON_ID`, `AUTH_PATREON_SECRET` (optional)
   : Signing in with GitHub, Google, Discord and Patreon (see [Signing in](#signing-in)). Each provider is offered only
     with both its id and its secret.

   `ADMIN_USER_IDS` (optional)
   : The user ids of admins whatever their role, separated by commas (see [Admins](#admins)).

   `GITHUB_TOKEN`, `GITLAB_TOKEN` (optional)
   : Raise the worker's limit on GitHub's API from 60 requests an hour to 5000; a token needs no scopes. Without one,
     packages listed by Foundry VTT still crawl in full, as their manifests are not fetched through the API.

3. Copy `deploy/swag/fvtt-package-catalogue.subdomain.conf.sample` to SWAG's
   `/config/nginx/proxy-confs/fvtt-package-catalogue.subdomain.conf`, set its `server_name`, and restart SWAG.
4. Sign in to the GitHub Container Registry, where the image is private, as the user that runs `docker compose` (root,
   with `sudo docker compose`). The token is a **classic** personal access token with the `read:packages` scope alone,
   from an account that can read the package; fine-grained tokens cannot sign in to the registry:

   ```shell
   read -rs TOKEN && echo "$TOKEN" | docker login ghcr.io --username <account> --password-stdin && unset TOKEN
   ```

   Docker keeps it in that user's `~/.docker/config.json`, only base64-encoded unless a credential helper is set up, so
   keep the file readable by its owner alone (`chmod 600`). When the token expires, the containers running carry on;
   only the next `docker compose pull` is refused (`denied` or `unauthorized`), until you sign in again with a new one.
5. Start it: `docker compose up -d`. The server starts once `migrate` has exited successfully:

   ```shell
   docker compose ps -a                # migrate: exited (0); app, db: running (healthy); worker: running
   docker compose logs migrate         # "The database is up to date"
   docker compose logs worker          # "The worker started", then each job
   ```

## Signing in

The website asks visitors to sign in with an account they already have: GitHub, Google, Discord or Patreon. Each
provider is offered only once its app is registered with it and its id and secret are in `.env`. Every app's callback,
or redirect, URL is `SITE_URL` followed by `/auth/callback/<provider>`; with `SITE_URL=https://catalogue.example.org`,
GitHub's is `https://catalogue.example.org/auth/callback/github`. After changing `.env`, `docker compose up -d app`.

GitHub
: Settings, Developer settings, OAuth Apps, New OAuth App. The homepage URL is `SITE_URL`, and the authorization
  callback URL is `SITE_URL/auth/callback/github`. Its client id and a client secret go in `AUTH_GITHUB_ID` and
  `AUTH_GITHUB_SECRET`.

Google
: In the Google Cloud console, set up the OAuth consent screen (Google Auth Platform: branding, audience), then, under
  Clients, create an OAuth client ID for a web application. Its authorised redirect URI is
  `SITE_URL/auth/callback/google`. Its client ID and secret go in `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. While the
  app is in testing, only the test users the consent screen lists can sign in; publish it to let anyone.

Discord
: In the Developer Portal, create an application, and under OAuth2 add the redirect `SITE_URL/auth/callback/discord`.
  Its client ID and client secret go in `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`.

Patreon
: In Patreon's developer portal (Clients & API Keys), create a client whose redirect URI is
  `SITE_URL/auth/callback/patreon`. Its client ID and client secret go in `AUTH_PATREON_ID` and `AUTH_PATREON_SECRET`.
  The catalogue asks a patron for their memberships too (the `identity.memberships` scope), to know whether they
  pledge to the catalogue's campaign: see [Subscriptions](#subscriptions). Someone signed in with Patreon before it
  asked for them links Patreon again, from their **Subscription** page, when it says so.

A user's providers are linked only as they ask, never because two share an email address: signing in with another
provider makes a profile of its own. Patreon is linked from the **Subscription** page, whatever its email address; one
Patreon account belongs to one profile alone.

Signing in keeps what the provider gives of the visitor (their name, email address and picture), their sessions, and
where each session signed in from. The website's "What we store" page (`/privacy`) lays it all out, row by row, and a
visitor can delete their profile, and all of it with it, from their profile page. The sign-in page says what is stored,
and links to that page, before any provider is chosen.

The API is not signed in to: it keeps its keys.

## Admins

An admin may, from the website's admin pages (`/admin`, offered in the bar along the top to admins alone, and not
found by anyone else): find users by their user id, nickname, name or email address; set their role, `user` or
`admin`; ban them, for good or for so many days, with a reason they are shown when they try to sign in; sign them out
everywhere; view the site as them, for an hour at most, to help with a problem they report; and read the audit log, of
what admins have done and what was done while an admin viewed the site as someone. While viewing the site as someone,
a banner on every page says so, and nothing an admin does, nor deleting the profile, is allowed until they stop.

The first admin is named in `.env`:

1. Sign in to the website once, so that your profile is made.
2. Find its id in the database. It is not the user id the profile page shows (such as `amber-falcon-ridge-42`), which
   is its `handle`:

   ```shell
   docker compose exec db psql -U catalogue -c "select id, handle, email from users"
   ```

3. Set `ADMIN_USER_IDS` to that id (several, separated by commas), and `docker compose up -d app`.

An admin so named is an admin whatever their role says, and only `.env` changes it: the admin pages offer no change
to their role or ban. Any admin can make others admins by role from the admin pages; an admin cannot change their own
role, ban themselves, or view the site as another admin.

### Subscriptions

A user's subscription is the time they are subscribed for: until the latest of its credits ends. Each user sees theirs
on their **Subscription** page. An admin, on a user's admin page, can grant them so many months and days (added after
the subscription's end, or from now if it has ended), set the day it ends (a later day adds time; an earlier one cuts
it back), or end it now. Each is recorded in the audit log, with how the subscription ended before and after. Admins
are always entitled to what a subscription gives, subscribed or not.

Subscriptions are bought by **offers**, made on the admin pages' **Subscriptions** page: a name, a period in months and
days, a price in each currency (one a line, such as `GBP 30.00`), and, if wanted, the days it is on sale between. An
offer is never changed once made, so that what was bought by it stays as it was: to change a price or a period, make a
new offer and retire the old one. The shortest offer on sale is the least that can be bought. Payment providers take
each payment through their own hosted checkout, and the catalogue keeps no payment details, only the provider's
reference for each payment.

**Stripe.** Offers are sold through Stripe Managed Payments, with Stripe, through Onelink, the merchant of record: it
works out, charges and pays the tax where each buyer lives, and emails their receipt and invoice. Each purchase is a
one-off payment for an offer's period; nothing renews. Before a buyer is sent to Stripe's checkout, the
**Subscription** page asks them, once for every offer, to ask that their time be activated as soon as they pay and to
agree to the Terms and Conditions (each **Buy** waits for it), and records when they did. Their time is added when Stripe's webhook says the payment succeeded, once however often
it says so.

- In Stripe's dashboard, with Managed Payments set up: make a restricted key that may write Checkout Sessions,
  Products, Prices and Refunds, and set it as `STRIPE_SECRET_KEY` (a sandbox's, `rk_test_…`, sells nothing for real).
- Add a webhook endpoint at `https://<SITE_URL>/webhooks/stripe` for the events `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
  `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated` and `charge.dispute.closed`,
  and set its signing secret as `STRIPE_WEBHOOK_SECRET`. Without it the catalogue does not start with a key set.
- Set a support email address in Stripe's dashboard: Stripe shows it to buyers.
- `STRIPE_CURRENCY` is the one currency sold in, `GBP` by default; `STRIPE_TAX_CODE` the tax code on each offer's
  Stripe Product, `txcd_10103000` (software as a service, personal use) by default. Then `docker compose up -d app`.
- An offer made while Stripe is set up, with a price in that currency, is made a Stripe Product and Price, before tax,
  and sold through Stripe; the **Subscription** page shows its price with "+ applicable tax". An offer made before is
  not: make a new one. Retiring an offer archives its Stripe Price and Product.
- A user's admin page links each payment to Stripe's dashboard, which keeps its invoice; a sandbox's are marked.
- **Refunds.** A buyer can cancel a purchase and ask for a refund on their **Subscription** page at any time. A dialog
  shows them the refund first: what was paid for the days not yet used, counted from when that purchase's time starts
  (time bought on to the end of a running subscription has used none of itself yet), and whether it would leave them
  unsubscribed. They confirm it there, or cancel.
  - **Within 14 days of buying it**, through Stripe, it is refunded at once: no admin makes it. If Stripe will not
    refund it then, it is left to an admin, as below.
  - **Later**, they choose a reason (No longer required, Too expensive, or Other, in their own words), and the request
    is confirmed on the page. The admin pages' **Subscriptions** page lists the refunds asked for, oldest first, each with
    its reason, the refund owed now, and a link to make it in Stripe's dashboard.
  - Once Stripe says a refund is made, by the catalogue, an admin, or Stripe itself (as merchant of record it may refund
    within 60 days), its share of the purchase's days, rounded down, comes off the end of the subscription, and the
    request leaves the list. Each is audited, by `stripe`.
- **Disputes.** A payment disputed with the buyer's bank is listed under **Outstanding disputes** on the admin pages'
  **Subscriptions** page, the longest open first, with a link to answer it in Stripe's dashboard, and flagged on the
  user's admin page, while it is decided; it leaves the list, cleared, once won. One lost is charged back: it takes back what remains of the purchase's time, and stays recorded.
- The Terms and Conditions the **Subscription** page links to are published at `/terms`: publish them before selling
  for real.

**Patreon.** A user who links Patreon, from their **Subscription** page, is subscribed while they are an active
patron of the catalogue's campaign, pledging at least the least pledge set on the admin pages' **Subscriptions** page.
It makes no credits: Patreon is asked, with the patron's own token, as they use what a subscription gives.

- Set `PATREON_CAMPAIGN_ID` to the campaign's id: Patreon's API gives it
  (`curl -H "Authorization: Bearer <creator's access token>" https://www.patreon.com/api/oauth2/v2/campaigns`, the
  creator's access token from the client's page in the developer portal), and `docker compose up -d app`.
- Set the least pledge, in the campaign's currency, such as `GBP 3.00`. Until it is set, Patreon subscribes no one. It
  counts at once, against what Patreon last said of each patron. The audit log records each change.
- Patreon's answer is kept a day, then asked again; a patron can ask again at once from their **Subscription** page.
  While Patreon cannot be asked, the last answer counts for three days more. A patron whose token Patreon no longer
  takes is not subscribed by it until they link Patreon again.
- A user's admin page shows what Patreon last said of them, without asking it.

## The worker

The worker crawls every package a client asks for that the catalogue does not hold, and what its releases require or
run in, as far down as they go: every version that Foundry VTT's index, GitHub and GitLab list, each loaded from its
own manifest. It saves even a package no source knows, so that it is not asked for again; what could not be fetched is
kept as the package's gaps, which the universe gives. A crawl that fails is tried again after a minute, then after
twice as long each time, to a day at most. Foundry VTT's builds are fetched from its release notes once a day.

Every hour (`REFRESH_MINUTES`), the worker reads Foundry VTT's index and crawls again each package it holds that the
index says has changed. Every package is crawled again a week (`REFRESH_STALE_DAYS`) after it was last synced, whatever
the index says. Each package's own manifest is also read about once an hour (`OWN_MANIFEST_CHECK_MINUTES`), checking
those due every five minutes, and the package crawled again if it gives a version not held: some authors publish by
their manifest alone, as Foundry VTT's updater reads it, and the index does not change. A manifest that has not changed
costs its server only a `304`. A refresh fetches only new versions' manifests: what it loaded before, it keeps.

The worker also warms the catalogue: each hour it queues every package Foundry VTT's index lists, and has not archived,
that it does not hold yet, and crawls up to `WARM_PER_HOUR` of them an hour (300 by default), after everything else on
the queue. The first time, that is about 6,700 packages, so about a day; after that, only packages newly listed. Set
`WARM_PER_HOUR=0` in `.env` to turn warming off, so that the catalogue holds only what clients have needed.

The worker crawls `CRAWL_CONCURRENCY` packages at once (4 by default), making at most `CRAWL_PER_HOST` requests to any
one host at once across them all (4 by default), so that GitHub's API or a package's host is never asked many times
at once. Each crawl may make at most `CRAWL_MAX_REQUESTS` requests (5000 by default). Stopping the container lets it
finish the packages in hand, for up to a minute; a package left unfinished, as when the container is killed, is crawled
again an hour later.

To work through the queue once, by hand, and exit: `docker compose run --rm worker node build/worker/main.js drain`.

To crawl every package held again, as after an upgrade that crawls differently: `docker compose run --rm worker node
build/worker/main.js recrawl`. It queues them and exits, and the running worker crawls them, a package at a time. A
crawl keeps each version it loaded before, so it fetches little more than the listings, and gives each version what
the sources say of it now, such as a manifest URL of its own that it had none of.

The worker has no health check: the image's asks the server, which only `app` runs. Its log says what it does.

### Package overrides

Some packages' sources mislead the catalogue: a listing may give every version the manifest URL of the newest, so the
older versions cannot be loaded, or a source may list a test build as a release. What the catalogue is told of such
packages is kept in `packages/catalogue/overrides.json`, which the image ships and changes, like code, by a pull
request. Each entry is keyed by the package (`module:<id>` or `system:<id>`) and must say why it is needed:

```json
{
  "module:baileywiki-content": {
    "reason": "The listing gives every version the newest's manifest URL; each has its own, on one host or the other.",
    "manifest": [
      "https://download.bailey.wiki/bcm/v{version}/module.json",
      "https://foundrymods.com/api/manifest/baileywiki-content?version={version}"
    ]
  },
  "module:multi-token-edit": {
    "reason": "The GitHub release 99.test is a test build.",
    "ignoreVersions": ["99.test"]
  }
}
```

- `manifest`: each version's own manifest URL, with `{version}` for the version as listed; or several, tried in order,
  as when an author moves to another host. A version takes the first URL whose manifest can be fetched and is of this
  package at this version: one that cannot be fetched, or gives another version, as a host may for a version it does
  not hold, is never offered. The release is loaded from the URL taken in place of the manifest its listing gives, and
  offers it as its own version's manifest, which EMMA's plan gives as the URL to install that version from. A URL
  taken is kept; one that is not is asked again at the next crawl, as it may be published later.
- `ignoreVersions`: versions the sources list that are not releases of the package, which are left out.
- `gone`: `true` when the package's files are no longer there, such as when its repository was deleted, though Foundry
  VTT still lists it. None of it is fetched; whatever was held of it is removed, and the universe names it as
  `unavailable`, with the reason as its note. It cannot be given with the other two.

A package whose listing Foundry VTT's index marks `archived` is still crawled: Foundry VTT's Setup screen no longer
offers it, but it installs it from a manifest that names it, as a module that requires it gives. Only when none of its
releases loads, and nothing failed that may succeed later, does the universe name it as `unavailable` because it is
archived. The hourly refresh crawls a package held so again when the index no longer archives it.

The worker reads the file when it starts, and stops at once if it is not valid, naming each problem. When it starts, it
queues every package it holds that has an override to be crawled again, so a changed override applies straight away;
a package with an override that the catalogue does not hold yet is left until a client asks for it. To use another
file, such as to try a fix before it is released, mount it in the worker's container and set `PACKAGE_OVERRIDES_FILE`
to its path. Removing an override does not crawl its package again: it takes effect at the package's next refresh.

## Upgrading

Set `CATALOGUE_TAG`, then `docker compose pull && docker compose up -d`. The migration runs again first; it applies only
what the database does not have yet. If the pull is refused, the registry's token has expired: sign in again (see
[Setting up](#setting-up)).

An upgrade does not crawl the packages held again, except those with overrides: each waits for its next refresh. When
the release notes say a release crawls differently, run `recrawl` (see [the worker](#the-worker)) once it is up. 0.5.0
does: with resolver 0.9, premium packages' versions get a manifest URL of their own, such as Epic Rolls 5e 6.1.0's.
So does the release with resolver 0.9.1, which reads tags such as Pathfinder's `pf2e-8.6.1` as `8.6.1`: a recrawl saves
those versions afresh, and removes the ones an older resolver misread, such as `2e-8.6.1`, which could never be loaded.

## Rotating an API key

1. Add the new key to `API_KEYS`, beside the old one, and `docker compose up -d app`.
2. Move the clients to the new key (for EMMA, in its release build).
3. Once no client uses the old key, remove it and `docker compose up -d app` again.

## Logs

Every process logs one JSON object per line to standard output: `docker compose logs app`, or `worker`; the worker
logs each job it does, with how many requests it made. Each request is logged
once, with its `requestId`, which error responses carry too.
