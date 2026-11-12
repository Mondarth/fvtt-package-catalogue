import { describe, expect, it } from 'vitest';

import { sql } from 'drizzle-orm';

import en from '../../../../messages/en.json';
import { STORED, UNUSED_COLUMNS } from '../../../../src/lib/stored.js';
import { testDatabase } from '../../support/pglite.js';

/** The accounts' tables, as the migrations make them. */
const TABLES = ['users', 'sessions', 'accounts', 'verifications'];

describe('what the "What we store" page lists', () => {
  // Migrating a fresh database takes a few seconds, more under coverage.
  it(
    "is every column of the accounts' tables, each once, but those that hold nothing",
    { timeout: 30_000 },
    async () => {
      const { db, close } = await testDatabase();
      try {
        const { rows } = (await db.execute<{ table_name: string; column_name: string }>(sql`
        select table_name, column_name from information_schema.columns
        where table_schema = 'public' and table_name in (${sql.join(
          TABLES.map(table => sql`${table}`),
          sql`, `,
        )})
      `)) as { rows: { table_name: string; column_name: string }[] };
        const columns = rows.map(({ table_name, column_name }) => `${table_name}.${column_name}`).sort();
        const listed = STORED.flatMap(item => item.columns);
        expect(new Set(listed).size).toBe(listed.length);
        expect([...listed, ...UNUSED_COLUMNS].sort()).toEqual(columns);
      } finally {
        await close();
      }
    },
  );

  it('says what each row is and why it is kept', () => {
    const messages: Record<string, string> = en;
    for (const { id } of STORED) {
      expect(messages[`privacy_${id}_what`], id).toBeTruthy();
      expect(messages[`privacy_${id}_why`], id).toBeTruthy();
    }
  });
});
