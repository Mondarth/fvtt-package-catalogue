/**
 * The accounts, as an application reaches them over their internal API: an {@link Accounts} that asks the accounts'
 * server, on the deployment's own network, with the application's key.
 *
 * Who a token or a cookie is for, and what a user is entitled to, are kept a minute, as the catalogue kept its own
 * entitlements, so that an application's requests cost the accounts little: a session ended, or a subscription
 * changed, is seen within the minute. A user's use of the service is told at once, never kept.
 *
 * Should the accounts not answer, or answer what this cannot read, the call throws {@link AccountsUnavailable}: an
 * application says so, rather than take a user for no one.
 */
import {
  INTERNAL_KEY_HEADER,
  INTERNAL_PATHS,
  entitlementSchema,
  serviceUseSchema,
  accountUserSchema,
  userResponse,
} from './index.js';

import type { Accounts, AccountUser, Entitlement } from './index.js';
import type { z } from 'zod';

/** How long an answer is kept. */
const KEPT_MS = 60_000;

/** How many answers of each kind are kept, the oldest forgotten first. */
const KEPT_MOST = 10_000;

/** The accounts could not be asked, or answered what could not be read. */
export class AccountsUnavailable extends Error {
  override readonly name = 'AccountsUnavailable';
}

/** How the accounts are reached. */
export interface HttpAccountsOptions {
  /** The accounts' address on the deployment's network, such as `http://accounts:3000`. */
  readonly url: string;
  /** The application's key. */
  readonly key: string;
  /** Fetches; the global `fetch` by default. */
  readonly fetch?: typeof fetch;
  /** The time now, in milliseconds; `Date.now` by default. */
  readonly clock?: () => number;
}

/** Answers kept a while, by what was asked. */
function kept<T>(clock: () => number) {
  const answers = new Map<string, { readonly at: number; readonly answer: Promise<T> }>();
  return (question: string, ask: () => Promise<T>): Promise<T> => {
    const found = answers.get(question);
    if (found !== undefined && clock() - found.at < KEPT_MS) return found.answer;
    const answer = ask();
    answers.delete(question);
    answers.set(question, { at: clock(), answer });
    // A failed answer is not kept: the next asks again.
    answer.catch(() => answers.delete(question));
    for (const oldest of answers.keys()) {
      if (answers.size <= KEPT_MOST) break;
      answers.delete(oldest);
    }
    return answer;
  };
}

/**
 * The accounts, over their internal API.
 *
 * @param options - How they are reached
 * @returns The accounts
 */
export function httpAccounts({ url, key, fetch: fetching = fetch, clock = Date.now }: HttpAccountsOptions): Accounts {
  /** Posts a request, giving the accounts' answer if they took it. */
  async function post(path: string, body: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await fetching(new URL(path, url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [INTERNAL_KEY_HEADER]: key },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new AccountsUnavailable(`The accounts could not be reached at ${url}`, { cause: error });
    }
    if (!response.ok) throw new AccountsUnavailable(`The accounts answered ${String(response.status)} to ${path}`);
    return response;
  }

  /** Posts a request, and reads the accounts' answer by a schema. */
  async function ask<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.output<S>> {
    const response = await post(path, body);
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new AccountsUnavailable(`The accounts' answer to ${path} could not be read`);
    return parsed.data;
  }

  const users = kept<AccountUser | undefined>(clock);
  const entitlements = kept<Entitlement>(clock);
  const userAt = async (path: string, body: unknown) => (await ask(path, body, userResponse)).user ?? undefined;

  return {
    userOf: token => users(`token:${token}`, () => userAt(INTERNAL_PATHS.tokenUser, { token })),
    userOfSession: cookie => users(`cookie:${cookie}`, () => userAt(INTERNAL_PATHS.sessionUser, { cookie })),
    entitlement: user =>
      entitlements(`${user.id}:${user.role}`, () =>
        ask(INTERNAL_PATHS.entitlement, { user: accountUserSchema.encode(user) }, entitlementSchema),
      ),
    async used(user, use) {
      await post(INTERNAL_PATHS.use, { user: accountUserSchema.encode(user), use: serviceUseSchema.encode(use) });
    },
  };
}
