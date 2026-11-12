/**
 * Nicknames: the name a user chooses to be shown by, in place of their handle.
 */

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 32;

/** Letters and digits of any script, spaces, hyphens and underscores. */
const ALLOWED = /^[\p{L}\p{N} _-]+$/u;

/** Names no one may take, whatever their case, so that no one passes for the site or its people. */
export const RESERVED = ['admin', 'administrator', 'mondarth', 'moderator', 'root', 'staff', 'support', 'system'];

/** Why a nickname was refused. */
export type NicknameProblem = 'length' | 'characters' | 'reserved';

/** A nickname checked: the nickname to keep, or why it cannot be one. */
export type CheckedNickname = { ok: true; nickname: string | null } | { ok: false; problem: NicknameProblem };

/**
 * Checks a nickname a user gave. Spaces at either end are dropped, and runs of spaces become one.
 *
 * @param given - What the user typed; nothing, or only spaces, clears the nickname
 * @returns The nickname to keep, or `null` to clear it; or why it cannot be one
 */
export function checkNickname(given: string): CheckedNickname {
  const nickname = given.trim().replace(/\s+/g, ' ');
  if (nickname === '') return { ok: true, nickname: null };
  // Counted in characters, not UTF-16 code units, so that a letter outside the BMP counts once.
  const length = Array.from(nickname).length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return { ok: false, problem: 'length' };
  if (!ALLOWED.test(nickname)) return { ok: false, problem: 'characters' };
  if (RESERVED.includes(nickname.toLowerCase())) return { ok: false, problem: 'reserved' };
  return { ok: true, nickname };
}

/**
 * The name a user is shown by.
 *
 * @param user - Their handle and nickname
 * @returns The nickname, if they set one, or else the handle
 */
export function shownName(user: { readonly handle: string; readonly nickname?: string | null | undefined }): string {
  return user.nickname ?? user.handle;
}
