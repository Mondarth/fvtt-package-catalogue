/**
 * A stand-in sign-in provider for trying the website out in development (`pnpm dev`), with a choice of made-up users.
 * The Vite plugin in `vite.config.ts` serves it on the development server alone, before SvelteKit, at
 * {@link DEV_PROVIDER_PATH}; the server offers it on the sign-in page only when `import.meta.env.DEV` is set (see
 * `runtime.ts`). A build has neither.
 *
 * It answers as an OAuth 2 provider does:
 *
 * - `GET /authorize` shows a page to choose who to sign in as: one of {@link DEV_USERS}, or someone new;
 * - `GET /choose` sends the browser back to the site with a code for the user chosen;
 * - `POST /token` trades the code for an access token;
 * - `GET /userinfo` says who the token is for.
 */
import { randomUUID } from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';

/** Where the development server serves it. */
export const DEV_PROVIDER_PATH = '/__dev/provider';

/** A made-up user to sign in as. */
export interface DevUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image?: string;
}

/** The users offered, each a profile of its own once signed in as, kept in the development database. */
export const DEV_USERS: readonly DevUser[] = [
  { id: 'dev-ada', name: 'Ada Lovelace', email: 'ada@dev.test' },
  { id: 'dev-grace', name: 'Grace Hopper', email: 'grace@dev.test' },
  { id: 'dev-alan', name: 'Alan Turing', email: 'alan@dev.test' },
  { id: 'dev-katherine', name: 'Katherine Johnson', email: 'katherine@dev.test' },
  { id: 'dev-linus', name: 'Linus Torvalds', email: 'linus@dev.test', image: 'https://example.test/linus.png' },
];

/**
 * The provider's address the server is told of: the development server's own, in development, unless another is set.
 *
 * @param given - `AUTH_TEST_PROVIDER_URL`, if set
 * @param siteUrl - The site's address
 * @param dev - Whether this is the development server (`import.meta.env.DEV`)
 * @returns The provider's address, or none
 */
export function testProviderUrl(given: string | undefined, siteUrl: string, dev: boolean): string | undefined {
  return given ?? (dev ? `${siteUrl}${DEV_PROVIDER_PATH}` : undefined);
}

/** Text safe inside an HTML attribute or element. */
function escape(text: string): string {
  return text.replace(/[&<>"']/g, char => `&#${String(char.charCodeAt(0))};`);
}

/**
 * The page that asks who to sign in as.
 *
 * @param back - Where the site wants the browser sent back, and the state it gave
 * @returns The page's HTML
 */
export function chooserPage(back: { readonly redirectUri: string; readonly state: string | null }): string {
  const link = (user: string, label: string) => {
    const query = new URLSearchParams({
      user,
      redirect_uri: back.redirectUri,
      ...(back.state !== null && { state: back.state }),
    });
    return `<li><a href="${DEV_PROVIDER_PATH}/choose?${escape(query.toString())}">${label}</a></li>`;
  };
  const users = DEV_USERS.map(user => link(user.id, `${escape(user.name)} <small>${escape(user.email)}</small>`));
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Dev sign-in</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:30rem;margin:3rem auto;padding:0 1rem}li{margin:.4rem 0}small{color:#777}</style>
</head>
<body>
<h1>Sign in as</h1>
<p>A stand-in provider, on the development server alone.</p>
<ul>
${users.join('\n')}
${link('new', 'Someone new')}
</ul>
</body>
</html>`;
}

/** A connect-style middleware, as Vite's development server takes. */
export type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

/**
 * The provider, as a middleware for Vite's development server: it answers under {@link DEV_PROVIDER_PATH}, and passes
 * everything else on.
 *
 * @param newId - The id of someone new; a random one by default
 * @returns The middleware
 */
export function devProvider(newId: () => string = () => `dev-${randomUUID().slice(0, 8)}`): Middleware {
  /** Who each code given out signs in as, until it is traded. */
  const codes = new Map<string, DevUser>();
  /** Who each access token is for. */
  const tokens = new Map<string, DevUser>();

  return (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://dev.invalid');
    if (!url.pathname.startsWith(`${DEV_PROVIDER_PATH}/`)) {
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
    const route = `${String(request.method)} ${url.pathname.slice(DEV_PROVIDER_PATH.length)}`;
    const redirectUri = url.searchParams.get('redirect_uri');
    // Back to the development server alone, so that it sends no one anywhere else.
    const backHome =
      redirectUri !== null && URL.canParse(redirectUri) && new URL(redirectUri).host === request.headers.host;

    if (route === 'GET /authorize' || route === 'GET /choose') {
      if (!backHome) {
        json(400, { error: 'invalid_request' });
        return;
      }
      const state = url.searchParams.get('state');
      if (route === 'GET /authorize') {
        reply(200, 'text/html; charset=utf-8', chooserPage({ redirectUri, state }));
        return;
      }
      const chosen = url.searchParams.get('user');
      const user =
        DEV_USERS.find(({ id }) => id === chosen) ??
        (() => {
          const id = newId();
          return { id, name: `New ${id}`, email: `${id}@dev.test` };
        })();
      const code = randomUUID();
      codes.set(code, user);
      const back = new URL(redirectUri);
      back.searchParams.set('code', code);
      if (state !== null) back.searchParams.set('state', state);
      reply(302, 'text/plain', '', { Location: back.toString() });
      return;
    }

    if (route === 'POST /token') {
      let body = '';
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      request.on('end', () => {
        const code = new URLSearchParams(body).get('code') ?? '';
        const user = codes.get(code);
        codes.delete(code);
        if (user === undefined) {
          json(400, { error: 'invalid_grant' });
          return;
        }
        const token = randomUUID();
        tokens.set(token, user);
        json(200, { access_token: token, token_type: 'Bearer', expires_in: 3600 });
      });
      return;
    }

    if (route === 'GET /userinfo') {
      const user = tokens.get(request.headers.authorization?.replace(/^Bearer /, '') ?? '');
      if (user === undefined) {
        json(401, { error: 'invalid_token' });
        return;
      }
      json(200, { id: user.id, name: user.name, email: user.email, email_verified: true, picture: user.image });
      return;
    }

    json(404, { error: 'not_found' });
  };
}
