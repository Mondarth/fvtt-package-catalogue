/** Where a request came from. */

/**
 * Where a request came from, as the adapter says, if it can.
 *
 * @param event - The request
 * @returns Its address, or none where the adapter knows none
 */
export function addressOf(event: { getClientAddress: () => string }): string | null {
  try {
    return event.getClientAddress();
  } catch {
    return null;
  }
}
