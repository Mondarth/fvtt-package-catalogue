import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';

import { GET } from '../../../src/routes/admin/subscriptions/evidence/[credit]/+server.js';
import { invoke } from '../support/event.js';

import type { AuditStore } from '../../../src/lib/server/accounts/audit.js';
import type { AccountsStore } from '../../../src/lib/server/accounts/store.js';
import type { SubscriptionStore } from '../../../src/lib/server/subscriptions/store.js';

type EvidenceEvent = Parameters<typeof GET>[0];

const CREDIT = {
  id: 'c1',
  userId: 'u1',
  source: 'payment',
  provider: 'stripe',
  externalRef: 'pi_1',
  providerAccount: 'live',
  offerId: 'o1',
  amountPaid: 3600,
  currencyPaid: 'GBP',
  refundedAmount: 0,
  refundedAt: null,
  refundRequestedAt: null,
  refundReason: null,
  refundReasonText: null,
  disputed: 'open',
  disputedAt: new Date('2026-11-21T00:00:00Z'),
  months: 12,
  days: 0,
  startsAt: new Date('2026-11-01T00:00:00Z'),
  endsAt: new Date('2027-11-01T00:00:00Z'),
  createdAt: new Date('2026-11-01T00:00:00Z'),
};

/**
 * Asks for a purchase's evidence.
 * @param more - What the request has besides
 * @param credit - The credit the store finds
 * @returns The answer, or what was thrown, and the audit log's recorder
 */
async function download(more: Partial<App.Locals> = {}, credit: unknown = CREDIT) {
  // `null` stands for none found, as `undefined` would be taken as the default.
  const found = credit === null ? undefined : credit;
  const record = vi.fn(() => Promise.resolve());
  const offer = vi.fn(() => Promise.resolve(undefined));
  try {
    const answer = await invoke<EvidenceEvent>(GET, {
      url: 'https://catalogue.test/admin/subscriptions/evidence/c1',
      params: { credit: 'c1' },
      locals: {
        user: { id: 'admin' } as never,
        isAdmin: true,
        subscriptions: {
          creditById: () => Promise.resolve(found),
          checkoutOfCredit: () => Promise.resolve(undefined),
          offer,
          status: () => Promise.resolve({ paidUntil: null, active: false }),
        } as unknown as SubscriptionStore,
        accounts: {
          userDetail: () =>
            Promise.resolve({
              id: 'u1',
              handle: 'amber-fox-oak-01',
              name: 'Amber',
              email: 'amber@example.test',
              createdAt: new Date('2026-10-01T00:00:00Z'),
              providers: [],
            }),
          sessionsOf: () => Promise.resolve([]),
        } as unknown as AccountsStore,
        audit: { record, recent: () => Promise.resolve([]) } as unknown as AuditStore,
        ...more,
      },
    });
    return { answer, record, offer };
  } catch (error) {
    return { error, record, offer };
  }
}

describe("a disputed purchase's evidence", () => {
  it('is a text file to save, of everything held of it and its buyer, its download recorded', async () => {
    const { answer, record, offer } = await download();
    expect(answer?.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(answer?.headers.get('content-disposition')).toBe(
      'attachment; filename="dispute-evidence-amber-fox-oak-01-pi_1.txt"',
    );
    expect(answer?.headers.get('cache-control')).toBe('no-store');
    const text = (await answer?.text()) ?? '';
    expect(text).toContain('  Paid, tax included: GBP 36.00');
    expect(text).toContain('  Email: amber@example.test');
    expect(offer).toHaveBeenCalledWith('o1');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin',
        action: 'dispute.evidence',
        subjectId: 'u1',
        after: { credit: 'c1', paymentIntent: 'pi_1' },
      }),
    );
  });

  it('names a file of a payment of no reference by its credit, and looks up no offer for one bought by none', async () => {
    const { answer, offer } = await download({}, { ...CREDIT, externalRef: null, offerId: null });
    expect(answer?.headers.get('content-disposition')).toBe(
      'attachment; filename="dispute-evidence-amber-fox-oak-01-c1.txt"',
    );
    expect(offer).not.toHaveBeenCalled();
  });

  it('is not there for anyone but an admin, nor for a credit there is not', async () => {
    const notAdmin = await download({ isAdmin: false });
    expect(isHttpError(notAdmin.error) && notAdmin.error.status).toBe(404);
    const none = await download({}, null);
    expect(isHttpError(none.error) && none.error.status).toBe(404);
  });
});
