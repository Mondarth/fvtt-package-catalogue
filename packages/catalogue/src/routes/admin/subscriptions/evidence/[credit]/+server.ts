import { error } from '@sveltejs/kit';

import { actorOf } from '#lib/server/accounts/actor.js';
import { evidenceText } from '#lib/server/subscriptions/evidence.js';

import type { RequestHandler } from './$types';

/** How many of the audit log's entries about the buyer the evidence gives: all there are, as near as can be. */
const AUDIT_GIVEN = 500;

/**
 * Dispute evidence for a purchase, as a text file to save: everything the catalogue holds about it and its buyer (see
 * `subscriptions/evidence.ts`), for an admin to give Stripe in answer to a dispute. Admins alone; each download is
 * recorded in the audit log, as it gathers what is held of the buyer.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.isAdmin) error(404);
  const credit = await locals.subscriptions.creditById(params.credit);
  if (credit === undefined) error(404);
  const buyer = await locals.accounts.userDetail(credit.userId);
  // A credit goes with its user.
  /* v8 ignore next */
  if (buyer === undefined) error(404);
  const [checkout, offer, subscription, sessions, audit] = await Promise.all([
    locals.subscriptions.checkoutOfCredit(credit.id),
    credit.offerId === null ? undefined : locals.subscriptions.offer(credit.offerId),
    locals.subscriptions.status(credit.userId),
    locals.accounts.sessionsOf(credit.userId),
    locals.audit.recent({ limit: AUDIT_GIVEN, userId: credit.userId }),
  ]);
  const admin = actorOf(locals);
  await locals.audit.record({
    actorId: admin,
    action: 'dispute.evidence',
    subjectId: credit.userId,
    after: { credit: credit.id, paymentIntent: credit.externalRef },
    requestId: locals.requestId,
  });
  const text = evidenceText({
    credit,
    checkout,
    offer,
    buyer,
    subscription,
    sessions,
    audit,
    madeBy: admin,
    madeAt: new Date(),
  });
  const name = `dispute-evidence-${buyer.handle}-${credit.externalRef ?? credit.id}.txt`.replace(/[^\w.-]/g, '_');
  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
};
