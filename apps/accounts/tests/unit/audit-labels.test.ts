import { describe, expect, it } from 'vitest';

import { actionLabel, changeOf } from '../../src/lib/audit-labels.js';
import { messagesOf } from './support/messages.js';

const en = messagesOf('en');

describe('actionLabel', () => {
  it('names each action recorded, and leaves one it does not know as it is', () => {
    expect(actionLabel('user.ban')).toBe(en.audit_action_user_ban);
    expect(actionLabel('profile.nickname')).toBe(en.audit_action_profile_nickname);
    expect(actionLabel('something.new')).toBe('something.new');
  });
});

describe('changeOf', () => {
  it('names each field that differs, from and to', () => {
    expect(changeOf({ role: 'user' }, { role: 'admin' })).toBe('role: user → admin');
    expect(changeOf({ banned: false, reason: null }, { banned: true, reason: 'Spam' })).toBe(
      'banned: false → true; reason: – → Spam',
    );
    expect(changeOf({ role: 'user', same: 1 }, { role: 'user', same: 1 })).toBe('');
  });

  it('takes what is not a record as nothing', () => {
    expect(changeOf(null, { nickname: 'A' })).toBe('nickname: – → A');
    expect(changeOf({ nickname: 'A' }, 'odd')).toBe('nickname: A → –');
    expect(changeOf(undefined, undefined)).toBe('');
  });
});
