import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accounts, users } from '../../../../src/lib/server/accounts/schema.js';
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
