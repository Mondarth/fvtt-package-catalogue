import type { PageServerLoad } from './$types';

/** The sign-in page's providers, and whether a sign-in just failed; nothing, for the workspace. */
export const load: PageServerLoad = ({ locals, url }) => ({
  providers: locals.user === null ? [...locals.providers] : [],
  failed: url.searchParams.has('error'),
});
