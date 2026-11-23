import { error } from '@sveltejs/kit';

import { applyStripeEvent } from '#lib/server/subscriptions/payments.js';

import type { RequestHandler } from './$types';

/**
 * Stripe's webhook: an event of a purchase, signed with the endpoint's secret, read from the raw body. An event Stripe
 * did not sign is refused; one the catalogue cannot apply now, such as when the database is down, fails, and Stripe
 * sends it again later. None while the catalogue sells nothing through Stripe.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  const { stripe } = locals;
  if (stripe === undefined) error(404);
  const event = stripe.event(await request.text(), request.headers.get('stripe-signature'));
  if (event === undefined) error(400, 'The event is not signed by Stripe');
  const applied = await applyStripeEvent(event, locals);
  return Response.json({ received: true, applied });
};
