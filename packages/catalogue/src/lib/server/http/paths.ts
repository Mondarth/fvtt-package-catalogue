/**
 * Which requests are the API's and which the website's. The API's are checked for a key and answered in the contract's
 * shape; only the website's are localised. One rule, so that the two can never disagree about a path.
 */
import { API_BASE } from '@mondarth/fvtt-package-catalogue-contract';

/** The container's health check: neither the API (it needs no key) nor the website (it is not localised). */
export const HEALTH_PATH = '/healthz';

/**
 * Whether a path is the API's.
 *
 * @param pathname - The request's path
 * @returns Whether it is under {@link API_BASE}
 */
export function isApiPath(pathname: string): boolean {
  return pathname === API_BASE || pathname.startsWith(`${API_BASE}/`);
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
