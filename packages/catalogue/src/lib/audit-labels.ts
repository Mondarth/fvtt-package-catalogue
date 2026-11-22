/**
 * How the admin pages show the audit log's entries: each action by its message, and what it changed as `from → to`.
 */
import { m } from '#lib/paraglide/messages.js';

const ACTIONS: Readonly<Record<string, () => string>> = {
  'user.set-role': m.audit_action_user_set_role,
  'user.ban': m.audit_action_user_ban,
  'user.unban': m.audit_action_user_unban,
  'user.impersonate': m.audit_action_user_impersonate,
  'user.stop-impersonating': m.audit_action_user_stop_impersonating,
  'user.revoke-sessions': m.audit_action_user_revoke_sessions,
  'profile.nickname': m.audit_action_profile_nickname,
  'subscription.grant': m.audit_action_subscription_grant,
  'subscription.set-end': m.audit_action_subscription_set_end,
  'subscription.revoke': m.audit_action_subscription_revoke,
  'offer.create': m.audit_action_offer_create,
  'offer.retire': m.audit_action_offer_retire,
  'patreon.minimum': m.audit_action_patreon_minimum,
  'payment.credit': m.audit_action_payment_credit,
  'payment.refund': m.audit_action_payment_refund,
  'payment.dispute': m.audit_action_payment_dispute,
  'refund.request': m.audit_action_refund_request,
};

/**
 * An action, as the page names it.
 *
 * @param action - The action, as recorded
 * @returns Its message, or the action itself for one the page does not know
 */
export const actionLabel = (action: string): string => ACTIONS[action]?.() ?? action;

/**
 * What an entry changed, each field that differs as `field: from → to`.
 *
 * @param before - How it was
 * @param after - How it is
 * @returns The changes, joined; empty where nothing is recorded
 */
export function changeOf(before: unknown, after: unknown): string {
  const was = (typeof before === 'object' && before !== null ? before : {}) as Record<string, unknown>;
  const now = (typeof after === 'object' && after !== null ? after : {}) as Record<string, unknown>;
  const shown = (value: unknown) =>
    value === null || value === undefined ? '–' : typeof value === 'string' ? value : JSON.stringify(value);
  return [...new Set([...Object.keys(was), ...Object.keys(now)])]
    .filter(field => JSON.stringify(was[field]) !== JSON.stringify(now[field]))
    .map(field => `${field}: ${shown(was[field])} → ${shown(now[field])}`)
    .join('; ');
}
