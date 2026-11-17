/**
 * Reading what PostgreSQL said of a query that failed, whichever driver connects to it.
 */

/** PostgreSQL's code for a unique constraint broken. */
const UNIQUE_VIOLATION = '23505';

/**
 * The code of a database error, wherever the driver puts it: Drizzle wraps the driver's error as its cause.
 *
 * @param error - What was thrown
 * @returns Its code, if it has one
 */
export function codeOf(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && error.code !== undefined) return error.code;
  return 'cause' in error ? codeOf(error.cause) : undefined;
}

/**
 * Whether a query failed for breaking a unique constraint.
 *
 * @param error - What was thrown
 * @returns `true` if it did
 */
export const isUniqueViolation = (error: unknown): boolean => codeOf(error) === UNIQUE_VIOLATION;
