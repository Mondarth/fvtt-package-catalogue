/**
 * Which requests are the website's, and which not: the internal API's, the health check, and payment providers'
 * webhooks. Only the website's are localised and signed in to. One rule, so that the hooks can never disagree.
 */
import { INTERNAL_API_ROOT } from '@mondarth/accounts-contract';

/** The container's health check: not the website's (it is not localised). */
export const HEALTH_PATH = '/healthz';

/** Where the internal API is: the other applications', on the deployment's own network, with their keys. */
export const INTERNAL_ROOT = '/internal';

/**
 * Whether a path is the internal API's, of any version, or of none: one under `/internal` that no version has is the
 * internal API's 404, not the website's.
 *
 * @param pathname - The request's path
 * @returns Whether it is under {@link INTERNAL_ROOT}
 */
export function isInternalPath(pathname: string): boolean {
  return pathname === INTERNAL_ROOT || pathname.startsWith(`${INTERNAL_ROOT}/`);
}

/** The path the internal API's present version is at. */
export { INTERNAL_API_ROOT };

/**
 * The path payment providers' webhooks are under, each at `/webhooks/<provider>`: not the website's (no one is signed
 * in to them, and they are not localised).
 */
export const WEBHOOKS_ROOT = '/webhooks';

/**
 * Whether a path is a webhook's.
 *
 * @param pathname - The request's path
 * @returns Whether it is under {@link WEBHOOKS_ROOT}
 */
export function isWebhookPath(pathname: string): boolean {
  return pathname.startsWith(`${WEBHOOKS_ROOT}/`);
}

/**
 * Whether a path is the website's.
 *
 * @param pathname - The request's path
 * @returns Whether it is neither the internal API's, the health check, nor a webhook's
 */
export function isSitePath(pathname: string): boolean {
  return !isInternalPath(pathname) && pathname !== HEALTH_PATH && !isWebhookPath(pathname);
}
