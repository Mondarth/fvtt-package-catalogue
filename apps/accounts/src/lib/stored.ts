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
  { id: 'role', from: 'us', columns: ['users.role'] },
  { id: 'ban', from: 'us', columns: ['users.banned', 'users.ban_reason', 'users.ban_expires'] },
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
  { id: 'impersonation', from: 'us', columns: ['sessions.impersonated_by'] },
  { id: 'client', from: 'us', columns: ['sessions.client_id'] },
  { id: 'return', from: 'browser', columns: ['sessions.return_to', 'sessions.return_site', 'sessions.return_at'] },
  {
    id: 'device_sign_in',
    from: 'us',
    columns: [
      'device_codes.id',
      'device_codes.device_code',
      'device_codes.user_code',
      'device_codes.user_id',
      'device_codes.expires_at',
      'device_codes.status',
      'device_codes.last_polled_at',
      'device_codes.polling_interval',
      'device_codes.client_id',
      'device_codes.scope',
    ],
  },
  {
    id: 'audit',
    from: 'us',
    columns: [
      'audit_log.id',
      'audit_log.at',
      'audit_log.actor_id',
      'audit_log.as_user_id',
      'audit_log.action',
      'audit_log.subject_id',
      'audit_log.before',
      'audit_log.after',
      'audit_log.request_id',
    ],
  },
  {
    id: 'subscription',
    from: 'us',
    columns: [
      'subscription_credits.id',
      'subscription_credits.user_id',
      'subscription_credits.source',
      'subscription_credits.offer_id',
      'subscription_credits.months',
      'subscription_credits.days',
      'subscription_credits.starts_at',
      'subscription_credits.ends_at',
      'subscription_credits.granted_by',
      'subscription_credits.note',
      'subscription_credits.created_at',
      'credit_eligibilities.credit_id',
      'credit_eligibilities.eligibility_id',
    ],
  },
  {
    id: 'payment',
    from: 'us',
    columns: [
      'subscription_credits.provider',
      'subscription_credits.method',
      'subscription_credits.external_ref',
      'subscription_credits.provider_account',
      'subscription_credits.amount_paid',
      'subscription_credits.currency_paid',
      'subscription_credits.refunded_amount',
      'subscription_credits.refunded_at',
      'subscription_credits.refund_requested_at',
      'subscription_credits.refund_reason',
      'subscription_credits.refund_reason_text',
      'subscription_credits.disputed',
      'subscription_credits.disputed_at',
    ],
  },
  {
    id: 'checkout',
    from: 'us',
    columns: [
      'subscription_checkouts.id',
      'subscription_checkouts.user_id',
      'subscription_checkouts.offer_id',
      'subscription_checkouts.provider',
      'subscription_checkouts.session_id',
      'subscription_checkouts.status',
      'subscription_checkouts.consented_at',
      'subscription_checkouts.credit_id',
      'subscription_checkouts.created_at',
      'subscription_checkouts.updated_at',
    ],
  },
  {
    id: 'patreon',
    from: 'provider',
    columns: [
      'patreon_memberships.user_id',
      'patreon_memberships.patron_status',
      'patreon_memberships.amount',
      'patreon_memberships.next_charge_at',
      'patreon_memberships.checked_at',
      'patreon_memberships.asked_at',
      'patreon_memberships.failure',
    ],
  },
  {
    id: 'last_session',
    from: 'us',
    columns: [
      'last_sessions.user_id',
      'last_sessions.session_id',
      'last_sessions.started_at',
      'last_sessions.last_active_at',
      'last_sessions.ended_at',
      'last_sessions.ip_address',
      'last_sessions.user_agent',
      'last_sessions.client_id',
    ],
  },
  {
    id: 'access',
    from: 'us',
    columns: [
      'access_records.id',
      'access_records.user_id',
      'access_records.at',
      'access_records.kind',
      'access_records.path',
      'access_records.client',
      'access_records.ip_address',
      'access_records.user_agent',
    ],
  },
  {
    id: 'known_identities',
    from: 'us',
    columns: [
      'known_identities.hash',
      'known_identities.kind',
      'known_identities.first_seen_at',
      'known_identities.introductory_claimed_at',
      'known_identities.purchases_refused_at',
    ],
  },
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
 * Columns that hold nothing, and so are not on the page: Better Auth's own, for what the accounts do not use.
 * `accounts.password` is for signing in with a password, which the accounts do not offer.
 */
export const UNUSED_COLUMNS: readonly string[] = ['accounts.password'];
