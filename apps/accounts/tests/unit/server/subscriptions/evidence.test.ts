import { describe, expect, it } from 'vitest';

import { evidenceText } from '../../../../src/lib/server/subscriptions/evidence.js';

import type { EvidenceInput } from '../../../../src/lib/server/subscriptions/evidence.js';
import type { Checkout, Credit, Offer } from '../../../../src/lib/server/subscriptions/store.js';

const T = (iso: string) => new Date(iso);

const CREDIT: Credit = {
  id: 'c1',
  userId: 'u1',
  source: 'payment',
  provider: 'stripe',
  method: null,
  externalRef: 'pi_1',
  providerAccount: 'test',
  offerId: 'o1',
  amountPaid: 3600,
  currencyPaid: 'GBP',
  refundedAmount: 1000,
  refundedAt: T('2026-11-20T10:00:00Z'),
  refundRequestedAt: T('2026-11-19T10:00:00Z'),
  refundReason: 'other',
  refundReasonText: 'Moving on',
  disputed: 'open',
  disputedAt: T('2026-11-21T10:00:00Z'),
  months: 12,
  days: 0,
  startsAt: T('2026-11-01T00:00:00Z'),
  endsAt: T('2027-11-01T00:00:00Z'),
  grantedBy: null,
  note: null,
  createdAt: T('2026-11-01T00:00:00Z'),
};

const CHECKOUT: Checkout = {
  id: 'k1',
  userId: 'u1',
  offerId: 'o1',
  provider: 'stripe',
  sessionId: 'cs_1',
  status: 'paid',
  consentedAt: T('2026-10-31T23:59:00Z'),
  creditId: 'c1',
  createdAt: T('2026-10-31T23:59:00Z'),
  updatedAt: T('2026-11-01T00:00:00Z'),
};

const OFFER: Offer = {
  id: 'o1',
  name: '12 months',
  months: 12,
  days: 0,
  prices: { GBP: 3000 },
  providers: ['stripe'],
  providerRefs: {},
  availableFrom: null,
  availableUntil: null,
  retiredAt: null,
  introductory: false,
  createdBy: 'admin',
  createdAt: T('2026-10-01T00:00:00Z'),
};

const INPUT: EvidenceInput = {
  credit: CREDIT,
  checkout: CHECKOUT,
  offer: OFFER,
  buyer: {
    id: 'u1',
    handle: 'amber-fox-oak-01',
    nickname: null,
    name: 'Amber',
    email: 'amber@example.test',
    role: null,
    banned: false,
    createdAt: T('2026-10-15T00:00:00Z'),
    image: null,
    banReason: null,
    banExpires: null,
    providers: [{ providerId: 'github', linkedAt: T('2026-10-15T00:00:00Z') }],
    sessions: 2,
  },
  subscription: { paidUntil: T('2027-10-01T00:00:00Z'), active: true },
  sessions: [
    {
      id: 's1',
      createdAt: T('2026-11-02T00:00:00Z'),
      updatedAt: T('2026-11-22T08:00:00Z'),
      userAgent: 'Firefox/140.0',
      ipAddress: '203.0.113.7',
      clientId: 'emma-extension',
      impersonatedBy: null,
    },
    {
      id: 's2',
      createdAt: T('2026-11-03T00:00:00Z'),
      updatedAt: T('2026-11-03T01:00:00Z'),
      userAgent: null,
      ipAddress: null,
      clientId: null,
      impersonatedBy: 'admin',
    },
    {
      id: 's3',
      createdAt: T('2026-11-04T00:00:00Z'),
      updatedAt: T('2026-11-04T00:00:00Z'),
      userAgent: 'curl',
      ipAddress: '198.51.100.1',
      clientId: 'some-app',
      impersonatedBy: null,
    },
  ],
  audit: [
    {
      id: 2,
      at: T('2026-11-19T10:00:00Z'),
      actorId: 'u1',
      asUserId: null,
      action: 'refund.request',
      subjectId: 'u1',
      before: null,
      after: { credit: 'c1' },
      requestId: null,
    },
    {
      id: 1,
      at: T('2026-11-01T00:00:00Z'),
      actorId: 'admin',
      asUserId: 'u1',
      action: 'profile.nickname',
      subjectId: 'u1',
      before: null,
      after: null,
      requestId: null,
    },
  ],
  lastSession: {
    userId: 'u1',
    sessionId: 's0',
    startedAt: T('2026-11-20T09:00:00Z'),
    lastActiveAt: T('2026-11-21T09:00:00Z'),
    endedAt: T('2026-11-21T10:00:00Z'),
    ipAddress: '203.0.113.7',
    userAgent: 'Firefox/140.0',
    clientId: 'emma-extension',
  },
  access: [
    {
      id: 2,
      userId: 'u1',
      at: T('2026-11-22T09:00:00Z'),
      kind: 'api',
      path: '/api/v2/lookup',
      client: 'EMMA-extension/0.13.1',
      ipAddress: '203.0.113.7',
      userAgent: 'Firefox/140.0',
    },
    {
      id: 1,
      userId: 'u1',
      at: T('2026-11-21T09:00:00Z'),
      kind: 'session',
      path: null,
      client: null,
      ipAddress: null,
      userAgent: null,
    },
  ],
  madeBy: 'admin',
  madeAt: T('2026-11-23T12:00:00Z'),
};

describe('dispute evidence', () => {
  it('says all the catalogue holds of the purchase and its buyer, in UTC', () => {
    const text = evidenceText(INPUT);
    for (const said of [
      'Dispute evidence: Foundry VTT Package Catalogue (Mondarth)',
      'Made 2026-11-23 12:00:00 UTC for admin admin',
      '  Bought: 2026-11-01 00:00:00 UTC',
      '  What it bought: 12 months (12 months) of subscription time',
      '  Paid, tax included: GBP 36.00',
      '  Time it bought: from 2026-11-01 00:00:00 UTC until 2027-11-01 00:00:00 UTC',
      '  Payment: pi_1 (a sandbox payment)',
      "  In Stripe's dashboard: https://dashboard.stripe.com/test/payments/pi_1",
      '  Consent: 2026-10-31 23:59:00 UTC: before paying, the buyer ticked "I ask that my time be activated',
      '  Checkout: cs_1 (paid), begun 2026-10-31 23:59:00 UTC',
      '  Refunded: GBP 10.00, last 2026-11-20 10:00:00 UTC',
      '  Refund asked for: 2026-11-19 10:00:00 UTC, as other: Moving on',
      '  Dispute: open, opened 2026-11-21 10:00:00 UTC',
      '  User: u1 (amber-fox-oak-01)',
      '  Email: amber@example.test',
      '  Signs in with: github (linked 2026-10-15 00:00:00 UTC)',
      '  Subscribed until: 2027-10-01 00:00:00 UTC',
      '  - Signed in 2026-11-02 00:00:00 UTC, last active 2026-11-22 08:00:00 UTC, through the EMMA browser extension',
      '    From 203.0.113.7, with Firefox/140.0',
      'through the website, an admin (admin) viewing the site as them',
      '    From -, with -',
      'through some-app',
      '  - 2026-11-19 10:00:00 UTC refund.request, by u1: {"credit":"c1"}',
      '  - 2026-11-01 00:00:00 UTC profile.nickname, by admin as u1',
      '  Signed in: 2026-11-20 09:00:00 UTC',
      '  Last active: 2026-11-21 09:00:00 UTC',
      '  Ended: 2026-11-21 10:00:00 UTC',
      '  Through: the EMMA browser extension',
      '  From: 203.0.113.7',
      '  With: Firefox/140.0',
      '  - 2026-11-22 09:00:00 UTC api /api/v2/lookup, through EMMA-extension/0.13.1, from 203.0.113.7, with Firefox/140.0',
      '  - 2026-11-21 09:00:00 UTC last session, as the dispute opened, through -, from -, with -',
    ]) {
      expect(text).toContain(said);
    }
    expect(text.endsWith('\n')).toBe(true);
  });

  it('says what it does not hold: no checkout, offer, refund, request, dispute, provider, session or entry', () => {
    const text = evidenceText({
      ...INPUT,
      credit: {
        ...CREDIT,
        provider: null,
        externalRef: null,
        providerAccount: null,
        amountPaid: null,
        refundedAmount: 0,
        refundRequestedAt: null,
        disputed: null,
        months: 1,
        days: 2,
      },
      checkout: undefined,
      offer: undefined,
      buyer: { ...INPUT.buyer, providers: [] },
      subscription: { paidUntil: null, active: false },
      sessions: [],
      audit: [],
      lastSession: undefined,
      access: [],
    });
    for (const said of [
      '  What it bought: 1 month and 2 days',
      '  Paid, tax included: -',
      '  Payment provider: -',
      '  Payment: -',
      '  Consent: no checkout of the catalogue made it, so none was recorded',
      '  Refunded: nothing',
      '  Refund asked for: never',
      '  Dispute: none recorded',
      '  Signs in with: -',
      '  Subscribed until: -',
      '  No session is signed in now.',
      '  Nothing recorded.',
      '  None recorded.',
    ]) {
      expect(text).toContain(said);
    }
    expect(text).not.toContain("In Stripe's dashboard");
  });

  it('names periods of days alone, of no length, and a refund asked for without a reason', () => {
    const text = (credit: Partial<Credit>) =>
      evidenceText({ ...INPUT, offer: undefined, credit: { ...CREDIT, ...credit } });
    expect(text({ months: 0, days: 1 })).toContain('  What it bought: 1 day\n');
    expect(text({ months: 2, days: 0 })).toContain('  What it bought: 2 months\n');
    expect(text({ months: 0, days: 0 })).toContain('  What it bought: -\n');
    expect(text({ refundReason: null, refundReasonText: null })).toContain(
      '  Refund asked for: 2026-11-19 10:00:00 UTC\n',
    );
    expect(text({ refundReason: 'too-expensive', refundReasonText: null })).toContain(', as too-expensive\n');
    expect(text({ providerAccount: 'live' })).toContain('  Payment: pi_1\n');
    expect(text({ provider: 'btcpay' })).not.toContain("In Stripe's dashboard");
    expect(text({ disputedAt: null })).toContain('  Dispute: open, opened -\n');
    expect(evidenceText({ ...INPUT, checkout: { ...CHECKOUT, sessionId: null } })).toContain('  Checkout: - (paid)');
    const stillIn = { ...INPUT.lastSession, endedAt: null, clientId: null, ipAddress: null, userAgent: null } as const;
    const signedIn = evidenceText({
      ...INPUT,
      lastSession: {
        ...stillIn,
        userId: 'u1',
        sessionId: 's0',
        startedAt: T('2026-11-20T09:00:00Z'),
        lastActiveAt: T('2026-11-21T09:00:00Z'),
      },
    });
    expect(signedIn).toContain('  Ended: not yet: still signed in\n  Through: the website\n  From: -\n  With: -');
    expect(
      evidenceText({ ...INPUT, access: [{ ...INPUT.access[0], path: null } as (typeof INPUT.access)[number]] }),
    ).toContain(' api -, through');
  });
});
