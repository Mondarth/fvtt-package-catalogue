/**
 * What a service is named and asked for by, here for the browser as well as the server: the admin's form fills in an
 * id from the name as it is typed, and the server checks both (see `server/subscriptions/services.ts`).
 */

/** What a service's id may be: lower-case letters, digits and single dashes, as `catalogue` or `aide-beta`. */
export const SERVICE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The longest a service's id, name or description may be. */
export const SERVICE_ID_MAX = 40;
export const SERVICE_NAME_MAX = 80;
export const SERVICE_DESCRIPTION_MAX = 500;

/**
 * An id for a service, from its name: `AIDE beta` is `aide-beta`.
 * @param name - Its name
 * @returns The id; empty where the name has no letters or digits
 */
export function serviceIdOf(name: string): string {
  return name
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, SERVICE_ID_MAX)
    .replace(/-+$/, '');
}
