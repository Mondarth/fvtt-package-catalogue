/**
 * Signing a device in, such as EMMA's browser extension: the OAuth 2 device authorization grant (RFC 8628), through
 * Better Auth's plugin. The device asks for codes (`POST /auth/device/code`), and sends its user to the website's
 * `/device` page, where they sign in, see which client asks, and approve or deny it; meanwhile the device polls
 * (`POST /auth/device/token`), and once approved is given a session's token, which the API takes as `Bearer`.
 *
 * Only the clients named here may sign in so; each session they are given is marked with the client's id, so that
 * the user's profile can say what each session is.
 */
import { lt } from 'drizzle-orm';

import { deviceCodes } from './schema.js';

import type { Database } from '../db/database.js';

/** The clients that may sign in by device, by id. */
export const DEVICE_CLIENTS = ['emma-extension'] as const;
export type DeviceClient = (typeof DEVICE_CLIENTS)[number];

/**
 * Whether a client may sign in by device.
 *
 * @param clientId - The id it gives
 * @returns `true` if it is one of {@link DEVICE_CLIENTS}
 */
export const isDeviceClient = (clientId: unknown): clientId is DeviceClient =>
  (DEVICE_CLIENTS as readonly unknown[]).includes(clientId);

/** How long a device's codes are good for: the user has this long to approve it. */
export const DEVICE_CODE_LIFETIME = '10m';

/** How often a device may poll for its token. */
export const DEVICE_POLL_INTERVAL = '5s';

/** The path of Better Auth's endpoint a device is given its token by, whose session is the device's. */
export const DEVICE_TOKEN_PATH = '/device/token';

/** The path a device asks for codes at. */
export const DEVICE_CODE_PATH = '/device/code';

/**
 * Deletes the codes that have expired: each user code is unique, so that one no longer good could otherwise stand in
 * the way of a new one, however unlikely.
 *
 * @param db - The database
 * @param now - The time now
 */
export async function deleteExpiredDeviceCodes(db: Database, now: Date = new Date()): Promise<void> {
  await db.delete(deviceCodes).where(lt(deviceCodes.expiresAt, now));
}
