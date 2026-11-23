/**
 * Dispute evidence: everything the catalogue holds about a disputed purchase and its buyer, as plain text, for an admin
 * to give Stripe in answer to the dispute. It is in English, as Stripe's dispute team reads it, whatever the admin's
 * language: the purchase and what it bought, the buyer's consent to the terms of sale and to their time being
 * activated at once, any refunds and the refund asked for, the buyer's account, the sessions they are signed in with
 * (where from, with what, and when last active), and what the audit log records of them.
 *
 * Against fraud, it keeps the buyer's last session after it ends, and, from when the dispute opened, a record of each
 * request they make, on the website and through the API (as the EMMA extension's lookups): both are given here.
 */
import { stripeDashboardUrl } from './stripe.js';

import type { AccessRecord, LastSession } from '../accounts/access.js';
import type { AuditRow } from '../accounts/audit.js';
import type { SessionSummary, UserDetail } from '../accounts/store.js';
import type { Checkout, Credit, Offer, SubscriptionStatus } from './store.js';

/** What the evidence is made from. */
export interface EvidenceInput {
  readonly credit: Credit;
  /** The checkout that made it, which records the buyer's consent. */
  readonly checkout: Checkout | undefined;
  /** The offer it was bought by. */
  readonly offer: Offer | undefined;
  readonly buyer: UserDetail;
  /** Their subscription now. */
  readonly subscription: SubscriptionStatus;
  /** The sessions they are signed in with now. */
  readonly sessions: readonly SessionSummary[];
  /** What the audit log records of them, the newest first. */
  readonly audit: readonly AuditRow[];
  /** Their last session, kept after it ends. */
  readonly lastSession: LastSession | undefined;
  /** Their access, recorded since the dispute opened, the newest first. */
  readonly access: readonly AccessRecord[];
  /** The admin it is made for, and when. */
  readonly madeBy: string;
  readonly madeAt: Date;
}

/** The clients a session can be of, as the evidence names them. */
const CLIENTS: Readonly<Record<string, string>> = { 'emma-extension': 'the EMMA browser extension' };

/** A time, as the evidence gives it: in UTC, to the second. */
const at = (when: Date | null | undefined) =>
  when === null || when === undefined ? '-' : `${when.toISOString().slice(0, 19).replace('T', ' ')} UTC`;

/** An amount, in its currency's major unit, as `GBP 36.00`. */
const money = (minor: number | null, currency: string | null) =>
  minor === null || currency === null ? '-' : `${currency} ${(minor / 100).toFixed(2)}`;

/** A period, in calendar months and days. */
const period = ({ months, days }: { readonly months: number; readonly days: number }) =>
  [
    months > 0 ? `${String(months)} month${months === 1 ? '' : 's'}` : '',
    days > 0 ? `${String(days)} day${days === 1 ? '' : 's'}` : '',
  ]
    .filter(part => part !== '')
    .join(' and ') || '-';

/**
 * The evidence, as text.
 *
 * @param input - What it is made from
 * @returns The text, lines ending in a newline
 */
export function evidenceText(input: EvidenceInput): string {
  const { credit, checkout, offer, buyer, subscription, sessions, audit, lastSession, access } = input;
  const client = (id: string | null) => (id === null ? 'the website' : (CLIENTS[id] ?? id));
  const lines: string[] = [];
  const line = (label: string, value: string) => lines.push(`  ${label}: ${value}`);
  const heading = (title: string) => lines.push('', title, '-'.repeat(title.length));

  lines.push(
    'Dispute evidence: Foundry VTT Package Catalogue (Mondarth)',
    `Made ${at(input.madeAt)} for admin ${input.madeBy}, from the catalogue's own records.`,
  );

  heading('The purchase');
  line('Bought', at(credit.createdAt));
  line(
    'What it bought',
    offer === undefined ? period(credit) : `${offer.name} (${period(offer)}) of subscription time`,
  );
  line('Paid, tax included', money(credit.amountPaid, credit.currencyPaid));
  line('Time it bought', `from ${at(credit.startsAt)} until ${at(credit.endsAt)}`);
  line('Payment provider', credit.provider ?? '-');
  line('Payment', `${credit.externalRef ?? '-'}${credit.providerAccount === 'test' ? ' (a sandbox payment)' : ''}`);
  if (credit.provider === 'stripe' && credit.externalRef !== null) {
    line("In Stripe's dashboard", stripeDashboardUrl(credit.providerAccount, credit.externalRef));
  }
  if (checkout === undefined) {
    line('Consent', 'no checkout of the catalogue made it, so none was recorded');
  } else {
    line(
      'Consent',
      `${at(checkout.consentedAt)}: before paying, the buyer ticked "I ask that my time be activated as soon as I pay, and I agree to the Terms and Conditions"`,
    );
    line('Checkout', `${checkout.sessionId ?? '-'} (${checkout.status}), begun ${at(checkout.createdAt)}`);
  }
  line(
    'Refunded',
    credit.refundedAmount > 0
      ? `${money(credit.refundedAmount, credit.currencyPaid)}, last ${at(credit.refundedAt)}`
      : 'nothing',
  );
  line(
    'Refund asked for',
    credit.refundRequestedAt === null
      ? 'never'
      : `${at(credit.refundRequestedAt)}${credit.refundReason === null ? '' : `, as ${credit.refundReason}${credit.refundReasonText === null ? '' : `: ${credit.refundReasonText}`}`}`,
  );
  line('Dispute', credit.disputed === null ? 'none recorded' : `${credit.disputed}, opened ${at(credit.disputedAt)}`);

  heading('The buyer');
  line('User', `${buyer.id} (${buyer.handle})`);
  line('Name', buyer.name);
  line('Email', buyer.email);
  line('Account made', at(buyer.createdAt));
  line(
    'Signs in with',
    buyer.providers.length === 0
      ? '-'
      : buyer.providers.map(({ providerId, linkedAt }) => `${providerId} (linked ${at(linkedAt)})`).join(', '),
  );
  line('Subscribed until', at(subscription.paidUntil));

  heading('Signed in now');
  if (sessions.length === 0) lines.push('  No session is signed in now.');
  for (const session of sessions) {
    lines.push(
      `  - Signed in ${at(session.createdAt)}, last active ${at(session.updatedAt)}, through ${client(session.clientId)}${
        session.impersonatedBy === null ? '' : `, an admin (${session.impersonatedBy}) viewing the site as them`
      }`,
      `    From ${session.ipAddress ?? '-'}, with ${session.userAgent ?? '-'}`,
    );
  }

  heading('Their last session');
  if (lastSession === undefined) {
    lines.push('  None recorded.');
  } else {
    line('Signed in', at(lastSession.startedAt));
    line('Last active', at(lastSession.lastActiveAt));
    line('Ended', lastSession.endedAt === null ? 'not yet: still signed in' : at(lastSession.endedAt));
    line('Through', client(lastSession.clientId));
    line('From', lastSession.ipAddress ?? '-');
    line('With', lastSession.userAgent ?? '-');
  }

  heading('Their use of the service since the dispute opened');
  if (access.length === 0) lines.push('  Nothing recorded.');
  for (const record of access) {
    lines.push(
      `  - ${at(record.at)} ${record.kind === 'session' ? 'last session, as the dispute opened' : `${record.kind} ${record.path ?? '-'}`}, through ${
        record.client ?? '-'
      }, from ${record.ipAddress ?? '-'}, with ${record.userAgent ?? '-'}`,
    );
  }

  heading('The audit log, of the buyer');
  if (audit.length === 0) lines.push('  Nothing recorded.');
  for (const entry of audit) {
    lines.push(
      `  - ${at(entry.at)} ${entry.action}, by ${entry.actorId}${entry.asUserId === null ? '' : ` as ${entry.asUserId}`}${
        entry.after === null ? '' : `: ${JSON.stringify(entry.after)}`
      }`,
    );
  }

  return `${lines.join('\n')}\n`;
}
