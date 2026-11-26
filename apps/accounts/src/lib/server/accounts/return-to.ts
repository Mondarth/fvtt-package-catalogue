/**
 * Going back to another Mondarth application: a visitor who comes to the accounts from one, such as from the catalogue's
 * profile menu, is offered the way back to the page they came from, named by its site. The page is given as `?next=`,
 * checked as a sign-in's is (`nextPath`: an origin the accounts know), and the site as `?from=`, one of Mondarth's.
 */
import { nextPath } from './next.js';

/** Mondarth's applications a visitor can come to the accounts from. */
export const RETURN_SITES = ['mondarth', 'catalogue', 'aide'] as const;

/** Which of Mondarth's applications. */
export type ReturnSite = (typeof RETURN_SITES)[number];

/** The way back: the page, and its site. */
export interface ReturnTo {
  readonly url: string;
  readonly site: ReturnSite;
}

/** How long the way back is kept with the session, from the visitor's arrival. */
export const RETURN_KEPT_MS = 4 * 60 * 60 * 1000;

/** Whether a site is one of Mondarth's applications. */
export const isReturnSite = (site: unknown): site is ReturnSite => RETURN_SITES.some(known => known === site);

/**
 * The page another application is to be gone back to, if it is one the accounts know: never a page of their own.
 *
 * @param given - The page
 * @param appOrigins - The applications' origins
 * @returns Its address, or none
 */
export function returnPage(given: unknown, appOrigins: readonly string[]): string | undefined {
  const page = nextPath(given, appOrigins);
  return page.startsWith('/') ? undefined : page;
}

/**
 * The way back a request's address gives: `?next=`, a page of an application the accounts know, and `?from=`, which.
 *
 * @param url - The request's address
 * @param appOrigins - The applications' origins
 * @returns The way back, or none
 */
export function returnFrom(url: URL, appOrigins: readonly string[]): ReturnTo | undefined {
  const page = returnPage(url.searchParams.get('next'), appOrigins);
  const site = url.searchParams.get('from');
  return page === undefined || !isReturnSite(site) ? undefined : { url: page, site };
}
