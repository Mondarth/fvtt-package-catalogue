import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { auditStore } from '../../../../src/lib/server/accounts/audit.js';
import { testDatabase } from '../../support/pglite.js';

import type { AuditStore } from '../../../../src/lib/server/accounts/audit.js';

let close: () => Promise<void>;
let audit: AuditStore;

beforeEach(async () => {
  const opened = await testDatabase();
  close = opened.close;
  audit = auditStore(opened.db);
});

afterEach(() => close());

describe('the audit log', () => {
  it('records an entry, with what it changed, and reads it back', async () => {
    await audit.record({
      actorId: 'admin',
      action: 'user.set-role',
      subjectId: 'u1',
      before: { role: 'user' },
      after: { role: 'admin' },
      requestId: 'r1',
    });
    expect(await audit.recent({ limit: 10 })).toMatchObject([
      {
        actorId: 'admin',
        asUserId: null,
        action: 'user.set-role',
        subjectId: 'u1',
        before: { role: 'user' },
        after: { role: 'admin' },
        requestId: 'r1',
      },
    ]);
  });

  it('records an entry with only who did what', async () => {
    await audit.record({ actorId: 'admin', action: 'user.revoke-sessions' });
    expect(await audit.recent({ limit: 10 })).toMatchObject([
      { subjectId: null, before: null, after: null, requestId: null },
    ]);
  });

  it('reads the newest first, a page at a time', async () => {
    for (const subjectId of ['u1', 'u2', 'u3']) await audit.record({ actorId: 'admin', action: 'user.ban', subjectId });
    const first = await audit.recent({ limit: 2 });
    expect(first.map(entry => entry.subjectId)).toEqual(['u3', 'u2']);
    const next = await audit.recent({ limit: 2, beforeId: first.at(-1)?.id });
    expect(next.map(entry => entry.subjectId)).toEqual(['u1']);
  });

  it('reads those about a user: done to them, by them, or as them', async () => {
    await audit.record({ actorId: 'admin', action: 'user.ban', subjectId: 'u1' });
    await audit.record({ actorId: 'u1', action: 'user.ban', subjectId: 'u2' });
    await audit.record({ actorId: 'admin', asUserId: 'u1', action: 'profile.nickname', subjectId: 'u1' });
    await audit.record({ actorId: 'admin', action: 'user.ban', subjectId: 'u3' });
    expect((await audit.recent({ limit: 10, userId: 'u1' })).map(entry => entry.subjectId)).toEqual(['u1', 'u2', 'u1']);
  });

  it('forgets what the entries about a user held of them, keeping who did what to whom, and when', async () => {
    const change = { before: { nickname: 'Old' }, after: { nickname: 'New' } };
    await audit.record({ actorId: 'admin', asUserId: 'u1', action: 'profile.nickname', subjectId: 'u1', ...change });
    await audit.record({ actorId: 'admin', action: 'user.set-role', subjectId: 'u2', ...change });
    await audit.forget('u1');
    const [other, forgotten] = await audit.recent({ limit: 10 });
    expect(forgotten).toMatchObject({ actorId: 'admin', subjectId: 'u1', before: null, after: null });
    expect(other).toMatchObject({ subjectId: 'u2', before: change.before, after: change.after });
  });
});
