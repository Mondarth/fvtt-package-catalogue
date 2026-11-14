/**
 * What signing in stores, as the "What we store" page (`/privacy`) lays it out: each row, where what it holds comes
 * from, and the columns of the accounts' tables (`server/accounts/schema.ts`) that hold it. A test checks that every
 * column is on the page, so that nothing is stored that the page does not say.
 */

/** Where what a row holds comes from. */
export type StoredFrom = 'provider' | 'us' | 'you' | 'browser';

/** A row of the page. */
export interface StoredItem {
  /** Names its messages: `privacy_<id>_what` and `privacy_<id>_why`. */
  readonly id: string;
  readonly from: StoredFrom;
  /** The columns that hold it, as `table.column`. */
  readonly columns: readonly string[];
}

const TIMES = ['created_at', 'updated_at'];

export const STORED: readonly StoredItem[] = [
  { id: 'name', from: 'provider', columns: ['users.name'] },
  { id: 'email', from: 'provider', columns: ['users.email', 'users.email_verified'] },
  { id: 'picture', from: 'provider', columns: ['users.image'] },
  { id: 'handle', from: 'us', columns: ['users.id', 'users.handle'] },
  { id: 'nickname', from: 'you', columns: ['users.nickname'] },
  {
    id: 'account',
    from: 'provider',
    columns: ['accounts.id', 'accounts.provider_id', 'accounts.account_id', 'accounts.user_id'],
  },
  {
    id: 'tokens',
    from: 'provider',
    columns: [
      'accounts.access_token',
      'accounts.refresh_token',
      'accounts.id_token',
      'accounts.access_token_expires_at',
      'accounts.refresh_token_expires_at',
      'accounts.scope',
    ],
  },
  { id: 'session', from: 'us', columns: ['sessions.id', 'sessions.token', 'sessions.user_id', 'sessions.expires_at'] },
  { id: 'device', from: 'browser', columns: ['sessions.ip_address', 'sessions.user_agent'] },
  {
    id: 'pending',
    from: 'us',
    columns: ['verifications.id', 'verifications.identifier', 'verifications.value', 'verifications.expires_at'],
  },
  {
    id: 'times',
    from: 'us',
    columns: ['users', 'accounts', 'sessions', 'verifications'].flatMap(table => TIMES.map(time => `${table}.${time}`)),
  },
];

/**
 * Columns that hold nothing, and so are not on the page: Better Auth's own, for what the catalogue does not use.
 * `accounts.password` is for signing in with a password, which the catalogue does not offer.
 */
export const UNUSED_COLUMNS: readonly string[] = ['accounts.password'];
