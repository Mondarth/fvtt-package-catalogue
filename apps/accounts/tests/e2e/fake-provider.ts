/**
 * A stand-in OAuth 2 sign-in provider for the end-to-end tests, which the built server is told of by
 * `AUTH_TEST_PROVIDER_URL`. It signs anyone in at once, with no page of its own:
 *
 * - `GET /as/<name>` sets who the browser signs in as from then on, with a cookie; one that has not been set signs in
 *   as someone new each time;
 * - `GET /authorize` sends the browser straight back with a code;
 * - `POST /token` trades the code for an access token;
 * - `GET /userinfo` says who the token is for: `<name>`, with the email address `<name>@example.test`.
 *
 * It stands in for Patreon too, which the server is told of by `PATREON_URL`, at Patreon's own paths:
 *
 * - `GET /oauth2/authorize` and `POST /api/oauth2/token`, as above, its token `ptoken-<name>`;
 * - `GET /api/oauth2/v2/identity` says who the token is for, `<name>`, and, asked for memberships, their membership
 *   of Mondarth's campaign (`e2e-campaign`), as `GET /patreon/<name>?status=…&cents=…` set it; none until then;
 * - `GET /patreon-down/<name>` has the identity endpoint answer 503 for `<name>`, until their pledge is set again.
 *
 * Run by Playwright beside the server (playwright.config.ts). Plain Node, its types stripped as it runs.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_PROVIDER_PORT ?? 4174);

/** Who each code given out signs in as, until it is traded. */
const codes = new Map<string, string>();

/** Mondarth's Patreon campaign, as the server is told of it (`PATREON_CAMPAIGN_ID`). */
const CAMPAIGN = 'e2e-campaign';

/** Each Patreon user's membership of the campaign, as a test set it; `down` while Patreon fails for them. */
const pledges = new Map<string, { status: string; cents: number } | 'down'>();

const COOKIE = 'fake_provider_user';

/** Who a request's browser signs in as, from its cookie. */
function chosenUser(cookie: string | undefined): string | undefined {
  const match = cookie?.split(/;\s*/).find(part => part.startsWith(`${COOKIE}=`));
  return match === undefined ? undefined : decodeURIComponent(match.slice(COOKIE.length + 1));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${String(port)}`);
  const reply = (status: number, body: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };

  if (request.method === 'GET' && url.pathname.startsWith('/as/')) {
    const name = decodeURIComponent(url.pathname.slice('/as/'.length));
    response.writeHead(200, {
      'Content-Type': 'text/plain',
      'Set-Cookie': `${COOKIE}=${encodeURIComponent(name)}; Path=/; SameSite=Lax`,
    });
    response.end(`Signing in as ${name}`);
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/patreon/')) {
    const name = decodeURIComponent(url.pathname.slice('/patreon/'.length));
    pledges.set(name, {
      status: url.searchParams.get('status') ?? 'active_patron',
      cents: Number(url.searchParams.get('cents') ?? 0),
    });
    reply(200, { ok: true });
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/patreon-down/')) {
    pledges.set(decodeURIComponent(url.pathname.slice('/patreon-down/'.length)), 'down');
    reply(200, { ok: true });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/oauth2/v2/identity') {
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!token.startsWith('ptoken-')) {
      reply(401, { errors: [{ code: 1, status: '401' }] });
      return;
    }
    const user = token.slice('ptoken-'.length);
    const pledge = pledges.get(user);
    if (pledge === 'down') {
      reply(503, { errors: [{ status: '503' }] });
      return;
    }
    const memberships = (url.searchParams.get('include') ?? '').includes('memberships');
    reply(200, {
      data: {
        id: user,
        type: 'user',
        attributes: { email: `${user}@patreon.test`, full_name: `Patron ${user}`, is_email_verified: true },
      },
      included:
        memberships && pledge !== undefined
          ? [
              {
                id: `m-${user}`,
                type: 'member',
                attributes: {
                  patron_status: pledge.status,
                  currently_entitled_amount_cents: pledge.cents,
                  next_charge_date: '2099-01-01T00:00:00.000+00:00',
                },
                relationships: { campaign: { data: { id: CAMPAIGN, type: 'campaign' } } },
              },
              { id: CAMPAIGN, type: 'campaign' },
            ]
          : [],
    });
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/authorize' || url.pathname === '/oauth2/authorize')) {
    const redirect = url.searchParams.get('redirect_uri');
    if (redirect === null) {
      reply(400, { error: 'invalid_request' });
      return;
    }
    const code = randomUUID();
    codes.set(code, chosenUser(request.headers.cookie) ?? `someone-${randomUUID().slice(0, 8)}`);
    const back = new URL(redirect);
    back.searchParams.set('code', code);
    const state = url.searchParams.get('state');
    if (state !== null) back.searchParams.set('state', state);
    response.writeHead(302, { Location: back.toString() });
    response.end();
    return;
  }

  if (request.method === 'POST' && (url.pathname === '/token' || url.pathname === '/api/oauth2/token')) {
    const patreon = url.pathname !== '/token';
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      const code = new URLSearchParams(body).get('code') ?? '';
      const user = codes.get(code);
      codes.delete(code);
      if (user === undefined) {
        reply(400, { error: 'invalid_grant' });
        return;
      }
      reply(
        200,
        patreon
          ? {
              access_token: `ptoken-${user}`,
              refresh_token: `prefresh-${user}`,
              token_type: 'Bearer',
              expires_in: 2_678_400,
              scope: 'identity identity[email] identity.memberships',
            }
          : { access_token: `token-${user}`, token_type: 'Bearer', expires_in: 3600 },
      );
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/userinfo') {
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!token.startsWith('token-')) {
      reply(401, { error: 'invalid_token' });
      return;
    }
    const user = token.slice('token-'.length);
    reply(200, { id: user, name: `Test ${user}`, email: `${user}@example.test`, email_verified: true });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/healthz') {
    reply(200, { ok: true });
    return;
  }
  reply(404, { error: 'not_found' });
});

server.listen(port, '127.0.0.1');
