import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accounts, sessions, users } from '../../../../src/lib/server/accounts/schema.js';
import { accountsStore } from '../../../../src/lib/server/accounts/store.js';
import { testDatabase } from '../../support/pglite.js';

import type { Database } from '../../../../src/lib/server/db/database.js';

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await testDatabase());
  await db.insert(users).values([
    { id: 'u1', name: 'One', email: 'one@example.test', handle: 'amber-fox-oak-01' },
    { id: 'u2', name: 'Two', email: 'two@example.test', handle: 'bold-owl-elm-02' },
  ]);
});

afterEach(() => close());

describe('setNickname', () => {
  it('sets a nickname, and clears it', async () => {
    const store = accountsStore(db);
    await expect(store.setNickname('u1', 'Ulenar')).resolves.toBe('ok');
    expect((await db.select().from(users)).find(user => user.id === 'u1')?.nickname).toBe('Ulenar');
    await expect(store.setNickname('u1', null)).resolves.toBe('ok');
    expect((await db.select().from(users)).find(user => user.id === 'u1')?.nickname).toBeNull();
  });

  it("refuses someone else's nickname, whatever its case", async () => {
    const store = accountsStore(db);
    await store.setNickname('u1', 'Ulenar');
    await expect(store.setNickname('u2', 'ULENAR')).resolves.toBe('taken');
    // Their own, in another case, is theirs to keep.
    await expect(store.setNickname('u1', 'ulenar')).resolves.toBe('ok');
  });

  it('passes any other failure on', async () => {
    const store = accountsStore(db);
    for (const thrown of [new Error('down'), 'down', { cause: { code: '08006' } }, { code: undefined }]) {
      vi.spyOn(db, 'update').mockImplementationOnce(() => {
        // Not always an Error: a driver may throw anything, and the store must pass it on as it is.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw thrown;
      });
      await expect(store.setNickname('u1', 'Ulenar')).rejects.toBe(thrown);
    }
  });
});

describe('linkedProviders', () => {
  it('lists the providers a user signs in with, the first linked first', async () => {
    const at = (day: number) => new Date(Date.UTC(2026, 10, day));
    await db.insert(accounts).values([
      { id: 'a2', accountId: '9', providerId: 'google', userId: 'u1', createdAt: at(2) },
      { id: 'a1', accountId: '7', providerId: 'github', userId: 'u1', createdAt: at(1) },
      { id: 'a3', accountId: '8', providerId: 'github', userId: 'u2', createdAt: at(1) },
    ]);
    await expect(accountsStore(db).linkedProviders('u1')).resolves.toEqual([
      { providerId: 'github', linkedAt: at(1) },
      { providerId: 'google', linkedAt: at(2) },
    ]);
  });
});

describe('listUsers', () => {
  beforeEach(async () => {
    await db
      .insert(users)
      .values([
        { id: 'u3', name: 'Ann 100%_off', email: 'ann@example.test', handle: 'calm-elk-ash-03', nickname: 'Annie' },
      ]);
  });

  it('lists every user, the newest first, with how many there are', async () => {
    const { users: found, total } = await accountsStore(db).listUsers({ limit: 10, offset: 0 });
    expect(total).toBe(3);
    expect(found.map(user => user.id).sort()).toEqual(['u1', 'u2', 'u3']);
    expect(found[0]).toMatchObject({ banned: false, role: null });
  });

  it('finds users by handle, nickname, name or email, whatever the case', async () => {
    const ids = async (search: string) =>
      (await accountsStore(db).listUsers({ search, limit: 10, offset: 0 })).users.map(user => user.id).sort();
    expect(await ids('BOLD-owl')).toEqual(['u2']);
    expect(await ids('annie')).toEqual(['u3']);
    expect(await ids('one')).toEqual(['u1']);
    expect(await ids('two@example')).toEqual(['u2']);
    expect(await ids('   ')).toEqual(['u1', 'u2', 'u3']);
  });

  it("matches a search's wildcards as themselves", async () => {
    const ids = async (search: string) =>
      (await accountsStore(db).listUsers({ search, limit: 10, offset: 0 })).users.map(user => user.id);
    expect(await ids('%_')).toEqual(['u3']);
    expect(await ids('_')).toEqual(['u3']);
    expect(await ids('\\')).toEqual([]);
  });

  it('gives a page at a time', async () => {
    const store = accountsStore(db);
    const first = await store.listUsers({ limit: 2, offset: 0 });
    const second = await store.listUsers({ limit: 2, offset: 2 });
    expect(first.users).toHaveLength(2);
    expect(second.users).toHaveLength(1);
    expect(first.total).toBe(3);
  });
});

describe('userDetail', () => {
  it('gives what is held of a user: their providers, ban and how many sessions are signed in now', async () => {
    const later = new Date(Date.now() + 60_000);
    await db.insert(accounts).values({ id: 'a1', accountId: 'gh-1', providerId: 'github', userId: 'u1' });
    await db.insert(sessions).values([
      { id: 's1', token: 't1', userId: 'u1', expiresAt: later },
      { id: 's2', token: 't2', userId: 'u1', expiresAt: new Date(Date.now() - 60_000) },
    ]);
    const detail = await accountsStore(db).userDetail('u1');
    expect(detail).toMatchObject({ id: 'u1', handle: 'amber-fox-oak-01', banned: false, banReason: null, sessions: 1 });
    expect(detail?.providers.map(provider => provider.providerId)).toEqual(['github']);
  });

  it('is nothing for a user there is not', async () => {
    expect(await accountsStore(db).userDetail('nobody')).toBeUndefined();
  });
});

describe('sessions', () => {
  const later = () => new Date(Date.now() + 60_000);

  beforeEach(async () => {
    await db.insert(sessions).values([
      { id: 's1', token: 't1', userId: 'u1', expiresAt: later(), createdAt: new Date('2026-11-01T00:00:00Z') },
      {
        id: 's2',
        token: 't2',
        userId: 'u1',
        expiresAt: later(),
        createdAt: new Date('2026-11-02T00:00:00Z'),
        clientId: 'emma-extension',
        userAgent: 'Firefox/140.0',
      },
      { id: 'gone', token: 't3', userId: 'u1', expiresAt: new Date(Date.now() - 60_000) },
      { id: 'theirs', token: 't4', userId: 'u2', expiresAt: later() },
    ]);
  });

  it("lists a user's sessions that have not ended, the newest first, without their tokens", async () => {
    const found = await accountsStore(db).sessionsOf('u1');
    expect(found.map(session => session.id)).toEqual(['s2', 's1']);
    expect(found[0]).toEqual({
      id: 's2',
      createdAt: new Date('2026-11-02T00:00:00Z'),
      updatedAt: expect.any(Date) as Date,
      userAgent: 'Firefox/140.0',
      ipAddress: null,
      clientId: 'emma-extension',
      impersonatedBy: null,
    });
    expect(found[0]).not.toHaveProperty('token');
  });

  it('ends one of the user’s own sessions, and never another’s', async () => {
    const store = accountsStore(db);
    expect(await store.endSessions('u1', { only: 'theirs' })).toBe(0);
    expect(await store.endSessions('u1', { only: 's2' })).toBe(1);
    expect((await store.sessionsOf('u1')).map(session => session.id)).toEqual(['s1']);
    expect((await store.sessionsOf('u2')).map(session => session.id)).toEqual(['theirs']);
  });

  it('ends every one of the user’s sessions but the one given', async () => {
    const store = accountsStore(db);
    expect(await store.endSessions('u1', { except: 's1' })).toBe(2);
    expect((await db.select({ id: sessions.id }).from(sessions)).map(row => row.id).sort()).toEqual(['s1', 'theirs']);
  });
});

describe('the way back to another application, kept with a session', () => {
  const BACK = { url: 'https://catalogue.example.org/developers', site: 'catalogue' } as const;
  const AT = new Date('2026-11-26T10:00:00Z');

  beforeEach(async () => {
    await db
      .insert(sessions)
      .values({ id: 's1', token: 't1', userId: 'u1', expiresAt: new Date('2027-01-01T00:00:00Z') });
  });

  it('is kept, given back for a few hours, and forgotten once taken', async () => {
    const store = accountsStore(db);
    await expect(store.returnOf('s1', AT)).resolves.toBeUndefined();
    await store.setReturn('s1', BACK, AT);
    await expect(store.returnOf('s1', new Date(AT.getTime() + 60_000))).resolves.toEqual(BACK);
    // Past the hours it is kept for, there is no way back.
    await expect(store.returnOf('s1', new Date(AT.getTime() + 4 * 60 * 60 * 1000 + 1))).resolves.toBeUndefined();
    await store.clearReturn('s1');
    await expect(store.returnOf('s1', AT)).resolves.toBeUndefined();
  });

  it('is replaced by the next, and given for no session there is not, nor for a site it does not know', async () => {
    const store = accountsStore(db);
    await store.setReturn('s1', BACK, AT);
    await store.setReturn('s1', { url: 'https://aide.example.org/', site: 'aide' }, AT);
    await expect(store.returnOf('s1', AT)).resolves.toEqual({ url: 'https://aide.example.org/', site: 'aide' });
    await expect(store.returnOf('nobody', AT)).resolves.toBeUndefined();
    await db.update(sessions).set({ returnSite: 'elsewhere' });
    await expect(store.returnOf('s1', AT)).resolves.toBeUndefined();
    await store.setReturn('s1', BACK);
    await expect(store.returnOf('s1')).resolves.toEqual(BACK);
  });
});
