/**
 * A stand-in for Patreon, for trying its linking and subscribing out in development (`pnpm dev`), with made-up patrons
 * whose pledges can be changed as the site runs. The Vite plugin in `vite.config.ts` serves it on the development
 * server alone, before SvelteKit, at {@link DEV_PATREON_PATH}; the server takes it for Patreon only when
 * `import.meta.env.DEV` is set and no Patreon app is (see {@link devPatreon}, `runtime.ts`). A build has neither.
 *
 * It answers at Patreon's own paths, under its own:
 *
 * - `GET /` lists the patrons, with forms to set each one's pledge, or have Patreon fail for them;
 * - `GET /oauth2/authorize` asks which patron to sign in as, and `GET /choose` sends the browser back with a code;
 * - `POST /api/oauth2/token` trades the code for a token, `dev-ptoken-<patron>`, which outlives the server's restarts;
 * - `GET /api/oauth2/v2/identity` says who the token is for, and, asked for memberships, their membership of the
 *   campaign {@link DEV_CAMPAIGN}, as it was set.
 */
import { randomUUID } from 'node:crypto';

import type { Middleware } from './dev-provider.js';

/** Where the development server serves it. */
export const DEV_PATREON_PATH = '/__dev/patreon';

/** The stand-in's campaign, which the server is told of. */
export const DEV_CAMPAIGN = 'dev-campaign';

/** The prefix of the tokens it gives. */
const TOKEN = 'dev-ptoken-';

/** A made-up patron, and their pledge to start with. */
export interface DevPatron {
  readonly id: string;
  readonly name: string;
  /** `active_patron`, `declined_patron` or `former_patron`; none for someone who is no member. */
  readonly status: string | null;
  /** In pence. */
  readonly cents: number;
}

/** The patrons offered, each a Patreon account of its own: some pledging enough, some not. */
export const DEV_PATRONS: readonly DevPatron[] = [
  { id: 'patron-ada', name: 'Ada (pledges £5.00)', status: 'active_patron', cents: 500 },
  { id: 'patron-grace', name: 'Grace (pledges £2.00)', status: 'active_patron', cents: 200 },
  { id: 'patron-alan', name: 'Alan (payment declined)', status: 'declined_patron', cents: 500 },
  { id: 'patron-katherine', name: 'Katherine (former patron)', status: 'former_patron', cents: 0 },
  { id: 'patron-linus', name: 'Linus (no member)', status: null, cents: 0 },
];

/** Where the server takes Patreon from: the app, Patreon's address and the campaign. */
export interface PatreonSetting {
  readonly app: { readonly clientId: string; readonly clientSecret: string } | undefined;
  readonly url: string | undefined;
  readonly campaignId: string | undefined;
}

/**
 * Patreon as the server takes it: as set, or, on the development server without a Patreon app, this stand-in.
 *
 * @param given - The app, address and campaign set
 * @param siteUrl - The site's address
 * @param dev - Whether this is the development server (`import.meta.env.DEV`)
 * @returns Patreon's setting
 */
export function devPatreon(given: PatreonSetting, siteUrl: string, dev: boolean): PatreonSetting {
  if (!dev || given.app !== undefined) return given;
  return {
    app: { clientId: 'dev-patreon', clientSecret: 'dev-patreon' },
    url: `${siteUrl}${DEV_PATREON_PATH}`,
    campaignId: given.campaignId ?? DEV_CAMPAIGN,
  };
}

/** Text safe inside an HTML attribute or element. */
function escape(text: string): string {
  return text.replace(/[&<>"']/g, char => `&#${String(char.charCodeAt(0))};`);
}

/** A patron's pledge, as the stand-in holds it now. */
export type Pledge = { readonly status: string | null; readonly cents: number } | 'down';

const PAGE_STYLE =
  'body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}li{margin:.5rem 0}' +
  'small{color:#777}form{display:inline-flex;gap:.4rem;margin-left:.5rem}input{width:5rem}';

/**
 * The page listing the patrons, each with their pledge, and forms to change it.
 *
 * @param pledges - Each patron's pledge now
 * @returns The page's HTML
 */
export function patronsPage(pledges: ReadonlyMap<string, Pledge>): string {
  const rows = DEV_PATRONS.map(patron => {
    const pledge = pledges.get(patron.id);
    const said =
      pledge === 'down'
        ? 'Patreon fails for them'
        : pledge === undefined || pledge.status === null
          ? 'no member'
          : `${pledge.status}, ${(pledge.cents / 100).toFixed(2)}`;
    const id = escape(patron.id);
    return `<li><strong>${escape(patron.name)}</strong> <small>${id}: ${escape(said)}</small>
<form method="post" action="${DEV_PATREON_PATH}/pledge"><input type="hidden" name="patron" value="${id}">
<select name="status" aria-label="Status of ${id}"><option>active_patron</option><option>declined_patron</option><option>former_patron</option><option value="">no member</option></select>
<input name="cents" type="number" min="0" value="${String(pledge === 'down' || pledge === undefined ? 0 : pledge.cents)}" aria-label="Pence of ${id}">
<button>Set</button></form>
<form method="post" action="${DEV_PATREON_PATH}/down"><input type="hidden" name="patron" value="${id}"><button>Fail</button></form></li>`;
  });
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Dev Patreon</title><style>${PAGE_STYLE}</style></head>
<body>
<h1>Dev Patreon</h1>
<p>A stand-in for Patreon, on the development server alone. Each patron pledges to the campaign <code>${DEV_CAMPAIGN}</code>.
A change is seen once the catalogue asks again: <strong>Ask Patreon again</strong> on the subscription page.
The least pledge that subscribes is set on the admin pages' Subscriptions page.</p>
<ul>
${rows.join('\n')}
</ul>
</body>
</html>`;
}

/**
 * The page that asks which patron to sign in as.
 *
 * @param back - Where the site wants the browser sent back, and the state it gave
 * @returns The page's HTML
 */
export function patronChooserPage(back: { readonly redirectUri: string; readonly state: string | null }): string {
  const links = DEV_PATRONS.map(patron => {
    const query = new URLSearchParams({
      patron: patron.id,
      redirect_uri: back.redirectUri,
      ...(back.state !== null && { state: back.state }),
    });
    return `<li><a href="${DEV_PATREON_PATH}/choose?${escape(query.toString())}">${escape(patron.name)}</a></li>`;
  });
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Dev Patreon sign-in</title><style>${PAGE_STYLE}</style></head>
<body>
<h1>Patreon: sign in as</h1>
<p>A stand-in for Patreon, on the development server alone. <a href="${DEV_PATREON_PATH}/">Change the patrons' pledges</a>.</p>
<ul>
${links.join('\n')}
</ul>
</body>
</html>`;
}

/**
 * Read a request's body.
 *
 * @param request - The request
 * @returns Its body, as text
 */
function bodyOf(request: Parameters<Middleware>[0]): Promise<string> {
  return new Promise(resolve => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      resolve(body);
    });
  });
}

/**
 * The stand-in, as a middleware for Vite's development server: it answers under {@link DEV_PATREON_PATH}, and passes
 * everything else on.
 *
 * @returns The middleware
 */
export function devPatreonProvider(): Middleware {
  /** Who each code given out signs in as, until it is traded. */
  const codes = new Map<string, string>();
  /** Each patron's pledge now, starting as {@link DEV_PATRONS} says. */
  const pledges = new Map<string, Pledge>(DEV_PATRONS.map(({ id, status, cents }) => [id, { status, cents }]));

  return (request, response, next) => {
    // Node gives every request its URL.
    /* v8 ignore next */
    const url = new URL(request.url ?? '/', 'http://dev.invalid');
    if (url.pathname !== DEV_PATREON_PATH && !url.pathname.startsWith(`${DEV_PATREON_PATH}/`)) {
      next();
      return;
    }
    const reply = (status: number, type: string, body: string, headers: Record<string, string> = {}) => {
      response.writeHead(status, { 'Content-Type': type, ...headers });
      response.end(body);
    };
    const json = (status: number, body: unknown) => {
      reply(status, 'application/json', JSON.stringify(body));
    };
    const route = `${String(request.method)} ${url.pathname.slice(DEV_PATREON_PATH.length) || '/'}`;
    const known = (id: string | null): id is string => DEV_PATRONS.some(patron => patron.id === id);

    if (route === 'GET /') {
      reply(200, 'text/html; charset=utf-8', patronsPage(pledges));
      return;
    }

    if (route === 'POST /pledge' || route === 'POST /down') {
      void bodyOf(request).then(body => {
        const form = new URLSearchParams(body);
        const patron = form.get('patron');
        if (!known(patron)) {
          json(400, { error: 'unknown patron' });
          return;
        }
        // An empty status is no member.
        const status = form.get('status');
        const cents = Math.trunc(Number(form.get('cents')));
        pledges.set(
          patron,
          route === 'POST /down'
            ? 'down'
            : { status: status === '' ? null : status, cents: Number.isFinite(cents) && cents > 0 ? cents : 0 },
        );
        reply(303, 'text/plain', '', { Location: `${DEV_PATREON_PATH}/` });
      });
      return;
    }

    const redirectUri = url.searchParams.get('redirect_uri');
    // Back to the development server alone, so that it sends no one anywhere else.
    const backHome =
      redirectUri !== null && URL.canParse(redirectUri) && new URL(redirectUri).host === request.headers.host;

    if (route === 'GET /oauth2/authorize' || route === 'GET /choose') {
      if (!backHome) {
        json(400, { error: 'invalid_request' });
        return;
      }
      const state = url.searchParams.get('state');
      if (route === 'GET /oauth2/authorize') {
        reply(200, 'text/html; charset=utf-8', patronChooserPage({ redirectUri, state }));
        return;
      }
      const patron = url.searchParams.get('patron');
      if (!known(patron)) {
        json(400, { error: 'unknown patron' });
        return;
      }
      const code = randomUUID();
      codes.set(code, patron);
      const back = new URL(redirectUri);
      back.searchParams.set('code', code);
      if (state !== null) back.searchParams.set('state', state);
      reply(302, 'text/plain', '', { Location: back.toString() });
      return;
    }

    if (route === 'POST /api/oauth2/token') {
      void bodyOf(request).then(body => {
        const code = new URLSearchParams(body).get('code') ?? '';
        const patron = codes.get(code);
        codes.delete(code);
        if (patron === undefined) {
          json(400, { error: 'invalid_grant' });
          return;
        }
        json(200, {
          access_token: `${TOKEN}${patron}`,
          refresh_token: `dev-prefresh-${patron}`,
          token_type: 'Bearer',
          expires_in: 2_678_400,
          scope: 'identity identity[email] identity.memberships',
        });
      });
      return;
    }

    if (route === 'GET /api/oauth2/v2/identity') {
      const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
      const patron = token.startsWith(TOKEN)
        ? DEV_PATRONS.find(({ id }) => id === token.slice(TOKEN.length))
        : undefined;
      if (patron === undefined) {
        json(401, { errors: [{ status: '401' }] });
        return;
      }
      const pledge = pledges.get(patron.id);
      if (pledge === 'down') {
        json(503, { errors: [{ status: '503' }] });
        return;
      }
      const member =
        (url.searchParams.get('include') ?? '').includes('memberships') && pledge?.status != null
          ? [
              {
                id: `member-${patron.id}`,
                type: 'member',
                attributes: {
                  patron_status: pledge.status,
                  currently_entitled_amount_cents: pledge.cents,
                  next_charge_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                },
                relationships: { campaign: { data: { id: DEV_CAMPAIGN, type: 'campaign' } } },
              },
            ]
          : [];
      json(200, {
        data: {
          id: patron.id,
          type: 'user',
          attributes: { email: `${patron.id}@dev.test`, full_name: patron.name, is_email_verified: true },
        },
        included: member,
      });
      return;
    }

    json(404, { error: 'not_found' });
  };
}
