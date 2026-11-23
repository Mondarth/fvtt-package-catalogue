/**
 * What tells a banned user, at the sign-in page, that they are banned, and why. Better Auth refuses their session and
 * sends the browser back with `error=BANNED_USER` and its message as `error_description`: text anyone can put in a
 * link. So the message is a notice signed with the site's secret, naming the user and when it expires, and the page
 * reads the ban's reason and end from the database for a notice it can verify, never the text itself.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** How long a notice is good for: the redirect back from the provider is followed at once. */
export const NOTICE_SECONDS = 10 * 60;

/** Better Auth's code for a sign-in refused as the user is banned. */
export const BANNED_CODE = 'BANNED_USER';

/** Makes and reads notices. */
export interface BanNotices {
  /** A notice for a user, good for {@link NOTICE_SECONDS} from now. */
  make(userId: string, now?: number): string;
  /** The user a notice names, if it is one this site made and it has not expired. */
  read(notice: string, now?: number): string | undefined;
}

/**
 * Notices signed with a secret.
 *
 * @param secret - The site's secret, `AUTH_SECRET`
 * @returns The notices
 */
export function banNotices(secret: string): BanNotices {
  const sign = (payload: string) => createHmac('sha256', `ban-notice:${secret}`).update(payload).digest('base64url');

  return {
    make(userId, now = Date.now()) {
      const payload = `${Buffer.from(userId).toString('base64url')}.${String(Math.floor(now / 1000) + NOTICE_SECONDS)}`;
      return `${payload}.${sign(payload)}`;
    },

    read(notice, now = Date.now()) {
      const [user, expires, signature, ...rest] = notice.split('.');
      if (user === undefined || expires === undefined || signature === undefined || rest.length > 0) return undefined;
      const expected = Buffer.from(sign(`${user}.${expires}`));
      const given = Buffer.from(signature);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
      if (!/^\d+$/.test(expires) || Number(expires) * 1000 < now) return undefined;
      return Buffer.from(user, 'base64url').toString();
    },
  };
}
