/**
 * The clients that sign in by device, by name, as the website shows them.
 */
import { m } from '#lib/paraglide/messages.js';

const NAMES: Readonly<Record<string, () => string>> = {
  'emma-extension': m.device_client_emma_extension,
};

/**
 * A client's name.
 *
 * @param clientId - Its id
 * @returns Its name, or its id for one the website does not know
 */
export const clientName = (clientId: string): string => NAMES[clientId]?.() ?? clientId;
