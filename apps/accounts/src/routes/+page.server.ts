import { redirect } from '@sveltejs/kit';

import { BANNED_CODE } from '#lib/server/accounts/ban-notice.js';
import { nextPath } from '#lib/server/accounts/next.js';

import type { PageServerLoad } from './$types';

/** Why a sign-in was refused as its user is banned: until when and why, where the notice it came back with is good. */
export type Banned = { readonly known: false } | { readonly known: true; reason: string | null; until: Date | null };

/**
 * The sign-in page's providers, and whether a sign-in just failed, and if so whether as its user is banned; nothing,
 * for the workspace. Better Auth adds its own `error` to the page's, so every one is read.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  // Where another application sent the visitor from, to sign in: back there once signed in, or at once if they are.
  const given = url.searchParams.get('next');
  const next = given === null ? undefined : nextPath(given, locals.appOrigins);
  // Another application's page is another origin's, which SvelteKit sends to only when told.
  if (locals.user !== null && next !== undefined) redirect(303, next, { external: !next.startsWith('/') });
  const errors = url.searchParams.getAll('error');
  let banned: Banned | null = null;
  if (locals.user === null && errors.includes(BANNED_CODE)) {
    const userId = locals.banNotices.read(url.searchParams.get('error_description') ?? '');
    const user = userId === undefined ? undefined : await locals.accounts.userDetail(userId);
    banned = user?.banned === true ? { known: true, reason: user.banReason, until: user.banExpires } : { known: false };
  }
  return {
    providers: locals.user === null ? [...locals.providers] : [],
    failed: errors.length > 0,
    banned,
    next,
  };
};
