/**
 * A stand-in for Stripe's API, for the end-to-end tests, which the built server is told of by `STRIPE_API_URL`. It
 * answers what the catalogue asks of Stripe (see `subscriptions/stripe.ts`), and stands in for Stripe's checkout page:
 *
 * - `POST /v1/products` and `POST /v1/prices` make a Product and a Price; `POST /v1/products/<id>` and
 *   `POST /v1/prices/<id>` change one, as archiving does;
 * - `POST /v1/checkout/sessions` makes a Checkout Session, whose address is `GET /pay/<session>` here;
 * - `GET /pay/<session>` is the checkout page, with **Pay** and **Cancel**: paying sends the catalogue's webhook a
 *   `checkout.session.completed` event, cancelling a `checkout.session.expired` one, each signed with the webhook's
 *   secret as Stripe signs them, and then sends the browser back to where the session says.
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
let made = 0;
/** Ids unique to each run, as Stripe's are, as the end-to-end database keeps what earlier runs made. */
const run = Date.now().toString(36);
const next = (prefix: string) => `${prefix}_e2e_${run}_${String(++made)}`;

/**
 * Sends the catalogue's webhook an event of a session, signed as Stripe signs them.
 * @param type - The event's type
 * @param session - The session
 * @param paid - Whether it was paid
 * @returns Once the catalogue has answered, with its status
 */
async function sendEvent(type: string, session: Session, paid: boolean): Promise<number> {
  const { form } = session;
  const payload = JSON.stringify({
    id: next('evt'),
    object: 'event',
    type,
    livemode: false,
    data: {
      object: {
        id: session.id,
        object: 'checkout.session',
        mode: form.get('mode'),
        payment_status: paid ? 'paid' : 'unpaid',
        payment_intent: paid ? `pi_for_${session.id}` : null,
        client_reference_id: form.get('client_reference_id'),
        metadata: { checkout: form.get('metadata[checkout]'), offer: form.get('metadata[offer]') },
      },
    },
  });
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
