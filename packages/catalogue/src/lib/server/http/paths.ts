/**
 * Which requests are the API's and which the website's. The API's are checked for a key and answered in the contract's
 * shape; only the website's are localised. One rule, so that the two can never disagree about a path.
 */

/** The container's health check: neither the API (it needs no key) nor the website (it is not localised). */
export const HEALTH_PATH = '/healthz';

/** The path every version of the API is under, each at `/api/<version>`. */
export const API_ROOT = '/api';

/**
 * Whether a path is the API's, of any version, or of none: one under `/api` that no version has is the API's 404, not
 * the website's.
 *
 * @param pathname - The request's path
 * @returns Whether it is under {@link API_ROOT}
 */
export function isApiPath(pathname: string): boolean {
  return pathname === API_ROOT || pathname.startsWith(`${API_ROOT}/`);
}

/**
 * Whether a path is the website's.
 *
 * @param pathname - The request's path
 * @returns Whether it is neither the API's nor the health check
 */
export function isSitePath(pathname: string): boolean {
  return !isApiPath(pathname) && pathname !== HEALTH_PATH;
}
