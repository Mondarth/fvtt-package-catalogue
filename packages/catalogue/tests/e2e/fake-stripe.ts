/**
 * A stand-in for Stripe's API, for the end-to-end tests, which the built server is told of by `STRIPE_API_URL`. It
 * answers what the catalogue asks of Stripe (see `subscriptions/stripe.ts`), and stands in for Stripe's checkout page:
 *
 * - `POST /v1/products` and `POST /v1/prices` make a Product and a Price; `POST /v1/products/<id>` and
 *   `POST /v1/prices/<id>` change one, as archiving does;
 * - `POST /v1/checkout/sessions` makes a Checkout Session, whose address is `GET /pay/<session>` here;
 * - `GET /pay/<session>` is the checkout page, with **Pay** and **Cancel**: paying sends the catalogue's webhook a
 *   `checkout.session.completed` event, cancelling a `checkout.session.expired` one, each signed with the webhook's
 *   secret as Stripe signs them, and then sends the browser back to where the session says;
 * - `GET /refund/<payment intent>?refunded=<pence>` stands in for an admin refunding a payment in Stripe's dashboard:
 *   it sends a `charge.refunded` event, saying so much has been refunded of it in all;
 * - `GET /dispute/<payment intent>?status=<status>` stands in for a buyer disputing a payment with their bank: it sends
 *   a `charge.dispute.created` event, or `charge.dispute.closed` for a status of `won` or `lost`;
 * - `POST /v1/refunds` refunds a payment as the catalogue asks, once for each `Idempotency-Key`, and then sends the
 *   `charge.refunded` event of it, with what has been refunded of it in all; `GET /refunds-fail/<payment intent>` has it
 *   refuse to refund that payment, as Stripe might.
 *
 * Run by Playwright beside the server (playwright.config.ts). Plain Node, its types stripped as it runs.
 */
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_STRIPE_PORT ?? 4175);
/** Where the catalogue is, whose webhook it sends events to. */
const site = process.env.SITE_URL ?? 'http://127.0.0.1:4173';
/** The secret it signs events with, as the catalogue is told of it (`STRIPE_WEBHOOK_SECRET`). */
const secret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_e2e';

/** A Checkout Session made, as the catalogue asked for it. */
interface Session {
  readonly id: string;
  readonly form: URLSearchParams;
}

const sessions = new Map<string, Session>();
/** What has been refunded of each payment in all, by its PaymentIntent. */
const refunded = new Map<string, number>();
/** The refunds made, by their idempotency keys, so that one asked for again is not made again. */
const refunds = new Map<string, string>();
/** The payments it refuses to refund. */
const unrefundable = new Set<string>();
let made = 0;
/** Ids unique to each run, as Stripe's are, as the end-to-end database keeps what earlier runs made. */
const run = Date.now().toString(36);
const next = (prefix: string) => `${prefix}_e2e_${run}_${String(++made)}`;

/**
 * Sends the catalogue's webhook an event, signed as Stripe signs them.
 * @param type - The event's type
 * @param object - What it is of
 * @returns Once the catalogue has answered, with its status
 */
async function send(type: string, object: Record<string, unknown>): Promise<number> {
  const payload = JSON.stringify({ id: next('evt'), object: 'event', type, livemode: false, data: { object } });
  const time = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret)
    .update(`${String(time)}.${payload}`)
    .digest('hex');
  const answer = await fetch(`${site}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${String(time)},v1=${signature}` },
    body: payload,
  });
  return answer.status;
}

/** What the stand-in charges for anything: the Price, which it does not keep, as 300p, and 20% tax on it. */
const CHARGED = 360;

/**
 * Sends the catalogue's webhook an event of a session, signed as Stripe signs them.
 * @param type - The event's type
 * @param session - The session
 * @param paid - Whether it was paid
 * @returns Once the catalogue has answered, with its status
 */
async function sendEvent(type: string, session: Session, paid: boolean): Promise<number> {
  const { form } = session;
  return send(type, {
    id: session.id,
    object: 'checkout.session',
    mode: form.get('mode'),
    payment_status: paid ? 'paid' : 'unpaid',
    payment_intent: paid ? `pi_for_${session.id}` : null,
    amount_total: paid ? CHARGED : null,
    currency: 'gbp',
    client_reference_id: form.get('client_reference_id'),
    metadata: { checkout: form.get('metadata[checkout]'), offer: form.get('metadata[offer]') },
  });
}

/** Text safe inside an HTML attribute or element. */
const escape = (text: string) => text.replace(/[&<>"']/g, char => `&#${String(char.charCodeAt(0))};`);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${String(port)}`);
  const reply = (status: number, body: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => {
    const form = new URLSearchParams(Buffer.concat(chunks).toString());
    const { pathname } = url;

    if (pathname === '/healthz') {
      reply(200, { ok: true });
      return;
    }
    if (request.method === 'POST' && pathname === '/v1/products') {
      reply(200, { id: next('prod'), object: 'product', name: form.get('name') });
      return;
    }
    if (request.method === 'POST' && pathname === '/v1/prices') {
      reply(200, { id: next('price'), object: 'price', product: form.get('product') });
      return;
    }
    const changed = /^\/v1\/(products|prices)\/([^/]+)$/.exec(pathname);
    if (request.method === 'POST' && changed !== null) {
      reply(200, { id: changed[2], object: changed[1] === 'prices' ? 'price' : 'product' });
      return;
    }
    if (request.method === 'POST' && pathname === '/v1/checkout/sessions') {
      const id = next('cs');
      sessions.set(id, { id, form });
      reply(200, { id, object: 'checkout.session', url: `http://127.0.0.1:${String(port)}/pay/${id}` });
      return;
    }

    if (request.method === 'POST' && pathname === '/v1/refunds') {
      const paymentIntent = form.get('payment_intent') ?? '';
      const key = request.headers['idempotency-key'];
      const made = typeof key === 'string' ? refunds.get(key) : undefined;
      if (made !== undefined) {
        reply(200, { id: made, object: 'refund' });
        return;
      }
      if (unrefundable.has(paymentIntent)) {
        reply(402, { error: { type: 'invalid_request_error', message: 'This payment cannot be refunded' } });
        return;
      }
      const id = next('re');
      if (typeof key === 'string') refunds.set(key, id);
      const total = (refunded.get(paymentIntent) ?? 0) + Number(form.get('amount') ?? CHARGED);
      refunded.set(paymentIntent, total);
      reply(200, { id, object: 'refund', payment_intent: paymentIntent });
      // As Stripe does, it says so by webhook once it is made.
      setTimeout(() => {
        void send('charge.refunded', {
          id: next('ch'),
          object: 'charge',
          payment_intent: paymentIntent,
          amount: CHARGED,
          amount_refunded: total,
        });
      }, 50);
      return;
    }
    const failing = /^\/refunds-fail\/([^/]+)$/.exec(pathname);
    if (request.method === 'GET' && failing !== null) {
      unrefundable.add(decodeURIComponent(failing[1] ?? ''));
      reply(200, { refusing: true });
      return;
    }
    const reversed = /^\/(refund|dispute)\/([^/]+)$/.exec(pathname);
    if (request.method === 'GET' && reversed !== null) {
      const paymentIntent = decodeURIComponent(reversed[2] ?? '');
      const status = url.searchParams.get('status') ?? 'needs_response';
      const sent =
        reversed[1] === 'refund'
          ? send('charge.refunded', {
              id: next('ch'),
              object: 'charge',
              payment_intent: paymentIntent,
              amount: CHARGED,
              amount_refunded: Number(url.searchParams.get('refunded') ?? CHARGED),
            })
          : send(status === 'won' || status === 'lost' ? 'charge.dispute.closed' : 'charge.dispute.created', {
              id: next('dp'),
              object: 'dispute',
              payment_intent: paymentIntent,
              status,
            });
      void sent.then(answered => {
        reply(answered === 200 ? 200 : 502, { webhook: answered });
      });
      return;
    }
    const paying = /^\/pay\/([^/]+)(?:\/(paid|cancel))?$/.exec(pathname);
    const session = paying === null ? undefined : sessions.get(paying[1] ?? '');
    if (paying !== null && session !== undefined) {
      if (request.method === 'GET' && paying[2] === undefined) {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(
          `<!doctype html><title>Stripe checkout (stand-in)</title><h1>Pay for ${escape(session.form.get('line_items[0][price]') ?? '')}</h1>` +
            `<form method="post" action="/pay/${session.id}/paid"><button>Pay</button></form>` +
            `<form method="post" action="/pay/${session.id}/cancel"><button>Cancel</button></form>`,
        );
        return;
      }
      if (request.method === 'POST' && paying[2] !== undefined) {
        const paid = paying[2] === 'paid';
        void sendEvent(paid ? 'checkout.session.completed' : 'checkout.session.expired', session, paid).then(status => {
          if (status !== 200) {
            response.writeHead(502, { 'Content-Type': 'text/plain' });
            response.end(`The catalogue's webhook answered ${String(status)}`);
            return;
          }
          response.writeHead(303, { Location: session.form.get(paid ? 'success_url' : 'cancel_url') ?? site });
          response.end();
        });
        return;
      }
    }
    reply(404, {
      error: { type: 'invalid_request_error', message: `No such path: ${request.method ?? ''} ${pathname}` },
    });
  });
});

server.listen(port, '127.0.0.1');
