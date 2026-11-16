import { describe, expect, it } from 'vitest';

import { banNotices, NOTICE_SECONDS } from '../../../../src/lib/server/accounts/ban-notice.js';

const notices = banNotices('a-test-secret-a-test-secret-a-test-secret');
const NOW = Date.parse('2026-11-16T12:00:00Z');

describe('a ban notice', () => {
  it('names the user it was made for, until it expires', () => {
    const notice = notices.make('user-1', NOW);
    expect(notices.read(notice, NOW)).toBe('user-1');
    expect(notices.read(notice, NOW + NOTICE_SECONDS * 1000)).toBe('user-1');
    expect(notices.read(notice, NOW + NOTICE_SECONDS * 1000 + 1000)).toBeUndefined();
  });

  it('keeps any id, dots and all', () => {
    expect(notices.read(notices.make('a.b:c d', NOW), NOW)).toBe('a.b:c d');
  });

  // Regression: a banned user was told only that signing in did not work; the reason now comes from the database,
  // for a notice only this site can make, so that a link cannot show a ban of its own.
  it('is nothing made elsewhere, changed, or not one at all', () => {
    const notice = notices.make('user-1', NOW);
    const [user = '', expires = '', signature = ''] = notice.split('.');
    expect(banNotices('another-secret-another-secret-another').read(notice, NOW)).toBeUndefined();
    expect(notices.read(`${Buffer.from('user-2').toString('base64url')}.${expires}.${signature}`, NOW)).toBeUndefined();
    expect(notices.read(`${user}.${String(Number(expires) + 60)}.${signature}`, NOW)).toBeUndefined();
    expect(notices.read(`${user}.${expires}.${signature.slice(1)}`, NOW)).toBeUndefined();
    expect(notices.read(`${notice}.more`, NOW)).toBeUndefined();
    for (const text of ['', 'You have been banned', 'a.b', 'a.x1.c']) expect(notices.read(text, NOW)).toBeUndefined();
  });

  it('reads the time now by default', () => {
    expect(notices.read(notices.make('user-1'))).toBe('user-1');
  });
});
