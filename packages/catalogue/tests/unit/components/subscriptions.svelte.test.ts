import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Offers from '../../../src/routes/admin/subscriptions/+page.svelte';
import User from '../../../src/routes/admin/users/[id]/+page.svelte';
import Subscription from '../../../src/routes/subscription/+page.svelte';
import { messagesOf } from '../support/messages.js';

const state = vi.hoisted(() => ({ page: { url: new URL('http://catalogue.test/admin/subscriptions') } }));
vi.mock('$app/state', () => state);
const navigation = vi.hoisted(() => ({ refreshAll: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/navigation', () => navigation);

const en = messagesOf('en');
const fill = (message: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), message);

const UNTIL = new Date('2027-12-01T00:00:00Z');

/** A row of those given, which must be there. */
function rowOf(rows: HTMLElement[], index: number): HTMLElement {
  const row = rows[index];
  if (row === undefined) throw new Error(`No row ${String(index)}`);
  return row;
}
const day = (when: Date) => when.toLocaleDateString('en');
const OFFER = {
  id: 'o1',
  name: '12 months',
  months: 12,
  days: 0,
  prices: { GBP: 3000, EUR: 3500 },
  providers: [] as string[],
  availableFrom: null as Date | null,
  availableUntil: null as Date | null,
  retiredAt: null as Date | null,
  createdBy: 'admin',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  stripePrice: null as { currency: string; amount: number } | null,
};

describe('the subscription page', () => {
  const show = (data: Record<string, unknown>) =>
    render(Subscription, {
      data: {
        entitlement: { paidUntil: null, active: false, patreon: false, entitled: false },
        admin: false,
        history: [],
        offers: [],
        canBuy: false,
        processing: 0,
        checkout: null,
        patreon: null,
        patreonDone: null,
        patreonError: null,
        ...data,
      },
      form: data.form ?? null,
      params: {},
    } as never);

  it('says until when the user is subscribed, the time that made it, and the ways to subscribe', () => {
    show({
      entitlement: { paidUntil: UNTIL, active: true, entitled: true },
      history: [
        {
          id: 'c1',
          source: 'grant',
          startsAt: new Date('2026-12-01T00:00:00Z'),
          endsAt: UNTIL,
          months: 12,
          days: 0,
          purchasedAt: new Date('2026-11-20T00:00:00Z'),
          paid: null,
        },
        {
          id: 'c2',
          source: 'other',
          startsAt: UNTIL,
          endsAt: UNTIL,
          months: 0,
          days: 0,
          purchasedAt: UNTIL,
          paid: { amount: 3600, currency: 'GBP' },
        },
      ],
      offers: [OFFER],
    });
    expect(screen.getByText(fill(en.subscription_active, { date: day(UNTIL) }))).toBeInTheDocument();
    // A subscriber is not told a subscription is needed.
    expect(screen.queryByText(en.subscription_gives)).not.toBeInTheDocument();
    const offers = screen.getByRole('region', { name: en.subscription_offers_heading });
    expect(offers).toHaveTextContent('12 months');
    expect(offers).toHaveTextContent('£30.00 · €35.00');
    expect(offers).toHaveTextContent(en.subscription_buy_soon);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(en.subscription_source_grant);
    expect(rows[1]).toHaveTextContent('12 months');
    expect(rows[1]).toHaveTextContent(day(new Date('2026-11-20T00:00:00Z')));
    expect(rows[2]).toHaveTextContent('other');
    expect(rows[2]).toHaveTextContent('–');
    // What was paid, tax included, where it was paid for.
    expect(rows[2]).toHaveTextContent('£36.00');
    expect(rows[0]).toHaveTextContent(en.subscription_column_paid);
    expect(screen.getByRole('region', { name: en.subscription_history_heading })).toBeInTheDocument();
  });

  it('says when it ended', () => {
    show({ entitlement: { paidUntil: UNTIL, active: false, entitled: false } });
    expect(screen.getByText(fill(en.subscription_ended, { date: day(UNTIL) }))).toBeInTheDocument();
    expect(screen.getByText(en.subscription_gives, { exact: false })).toBeInTheDocument();
  });

  it('says when there is none, nor anything on sale, and tells an admin they need none', () => {
    show({ admin: true });
    expect(screen.getByText(en.subscription_none)).toBeInTheDocument();
    expect(screen.getByText(en.subscription_admin)).toBeInTheDocument();
    expect(screen.getByText(en.subscription_offers_none)).toBeInTheDocument();
    expect(screen.getByText(en.subscription_history_none)).toBeInTheDocument();
  });
});

describe('the offers page', () => {
  const show = (offers: (typeof OFFER)[], more: { done?: string | null; form?: unknown; stripe?: string } = {}) =>
    render(Offers, {
      data: { offers, refundRequests: [], disputes: [], done: more.done ?? null, stripeCurrency: more.stripe ?? null },
      form: more.form ?? null,
      params: {},
    } as never);

  it('lists each offer, whether it is on sale and between when, with a button to retire one on sale', () => {
    show([
      { ...OFFER, availableFrom: new Date('2027-01-01T00:00:00Z'), availableUntil: new Date('2027-06-01T00:00:00Z') },
      { ...OFFER, id: 'o2', name: 'Old', retiredAt: new Date('2026-11-10T00:00:00Z') },
    ]);
    const rows = screen.getAllByRole('row');
    const current = rowOf(rows, 1);
    const old = rowOf(rows, 2);
    expect(current).toHaveTextContent(en.admin_offer_on_sale);
    expect(current).toHaveTextContent(fill(en.admin_offer_from, { date: day(new Date('2027-01-01T00:00:00Z')) }));
    expect(current).toHaveTextContent(fill(en.admin_offer_until, { date: day(new Date('2027-06-01T00:00:00Z')) }));
    expect(within(current).getByRole('button', { name: `${en.admin_offer_retire}: 12 months` })).toBeInTheDocument();
    expect(old).toHaveTextContent(fill(en.admin_offer_retired, { date: day(new Date('2026-11-10T00:00:00Z')) }));
    expect(within(old).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.admin_offer_create })).toBeInTheDocument();
  });

  it('says when there are none, and what was done', () => {
    show([], { done: 'retire' });
    expect(screen.getByText(en.admin_offers_none)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(en.admin_done_retire);
  });

  it.each([
    [{ problem: 'name' }, en.admin_offer_problem_name],
    [{ problem: 'period' }, en.admin_problem_period],
    [{ problem: 'prices', line: 'GBP x' }, fill(en.admin_offer_problem_prices, { line: 'GBP x' })],
    [{ problem: 'prices', line: '' }, en.admin_offer_problem_no_prices],
    [{ problem: 'dates' }, en.admin_offer_problem_dates],
  ])('says what is wrong with a new offer, keeping what was given', (problem, said) => {
    show([], { form: { name: 'Kept', months: '3', days: '', prices: 'GBP 1', ...problem } });
    expect(screen.getByRole('alert')).toHaveTextContent(said);
    expect(screen.getByRole('textbox', { name: en.admin_offer_name })).toHaveValue('Kept');
    expect(screen.getByRole('spinbutton', { name: en.admin_grant_months })).toHaveValue(3);
  });

  it('says what is wrong in the form, drawing the eye to it, and marks the fields, with the limits the browser checks', () => {
    show([], { form: { name: '', months: '9999', days: '', prices: 'GBP 1', problem: 'period' } });
    const callout = screen.getByRole('alert');
    expect(callout).toHaveFocus();
    expect(callout.closest('form')).toHaveAttribute('action', '?/create');
    const months = screen.getByRole('spinbutton', { name: en.admin_grant_months });
    expect(months).toHaveAttribute('aria-invalid', 'true');
    expect(months).toHaveAttribute('aria-describedby', 'offer-problem');
    expect(months).toHaveAttribute('max', '120');
    expect(screen.getByRole('textbox', { name: en.admin_offer_name })).toHaveAttribute('aria-invalid', 'false');
  });

  it('ignores what it was told was done that it does not know', () => {
    show([], { done: 'other' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe("a user's admin page's subscription", () => {
  const USER = {
    id: 'u1',
    handle: 'amber-fox-oak-01',
    nickname: null,
    name: 'One',
    email: 'one@example.test',
    role: null,
    banned: false,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    image: null,
    banReason: null,
    banExpires: null,
    providers: [],
    sessions: 0,
    admin: false,
    configured: false,
    self: false,
  };
  const CREDIT = {
    id: 'c1',
    source: 'payment',
    provider: 'btcpay',
    externalRef: 'inv-1',
    months: 12,
    days: 0,
    startsAt: new Date('2026-12-01T00:00:00Z'),
    endsAt: UNTIL,
    grantedBy: null as string | null,
    note: null as string | null,
    providerAccount: null as string | null,
    dashboard: null as string | null,
  };

  const show = (more: { subscription?: unknown; credits?: unknown[]; form?: unknown; done?: string } = {}) =>
    render(User, {
      data: {
        user: USER,
        audit: [],
        done: more.done ?? null,
        refused: null,
        subscription: more.subscription ?? { paidUntil: null, active: false },
        credits: more.credits ?? [],
        patreon: null,
      },
      form: more.form ?? null,
      params: { id: 'u1' },
    } as never);

  it('says until when they are subscribed, offers to grant, set the end or end it, and lists its credits', () => {
    show({
      subscription: { paidUntil: UNTIL, active: true },
      credits: [
        CREDIT,
        {
          ...CREDIT,
          id: 'c2',
          source: 'grant',
          provider: null,
          externalRef: null,
          grantedBy: 'admin',
          note: 'Goodwill',
          months: 0,
          days: 0,
        },
        { ...CREDIT, id: 'c3', source: 'odd', externalRef: null },
      ],
    });
    const section = screen.getByRole('region', { name: en.admin_subscription_heading });
    expect(section).toHaveTextContent(fill(en.admin_subscription_until, { date: UNTIL.toLocaleString('en') }));
    expect(within(section).getByRole('button', { name: en.admin_grant_button })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: en.admin_set_end_button })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: en.admin_revoke_button })).toBeInTheDocument();
    const rows = within(section).getAllByRole('row');
    const [paid, granted, odd] = [rowOf(rows, 1), rowOf(rows, 2), rowOf(rows, 3)];
    expect(paid).toHaveTextContent(en.subscription_source_payment);
    expect(paid).toHaveTextContent('btcpay inv-1');
    expect(granted).toHaveTextContent('Goodwill');
    expect(within(granted).getByRole('link', { name: 'admin' })).toHaveAttribute('href', '/admin/users/admin');
    expect(granted).toHaveTextContent('–');
    expect(odd).toHaveTextContent('odd');
  });

  it('says when it ended, or that there never was one, offering no end to what is not running', () => {
    show({ subscription: { paidUntil: UNTIL, active: false } });
    expect(
      screen.getByText(fill(en.admin_subscription_ended, { date: UNTIL.toLocaleString('en') })),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.admin_revoke_button })).not.toBeInTheDocument();
  });

  it('says there never was one', () => {
    show();
    expect(screen.getByText(en.admin_subscription_none)).toBeInTheDocument();
    expect(screen.getByText(en.admin_credits_none)).toBeInTheDocument();
  });

  it.each([
    ['period', en.admin_problem_period],
    ['note', en.admin_problem_note],
    ['date', en.admin_problem_date],
  ])('says what is wrong with a change: %s', (problem, said) => {
    show({ form: { action: 'grant', refusal: null, problem } });
    expect(screen.getByRole('alert')).toHaveTextContent(said);
  });

  it.each([
    ['grant', en.admin_done_grant],
    ['setEnd', en.admin_done_set_end],
    ['revoke', en.admin_done_revoke],
  ])('says it was done: %s', (done, said) => {
    show({ done });
    expect(screen.getByRole('status')).toHaveTextContent(said);
  });
});

describe('buying through Stripe, on the subscription page', () => {
  const STRIPE_OFFER = { ...OFFER, stripePrice: { currency: 'GBP', amount: 3000 } };
  const show = (data: Record<string, unknown>) =>
    render(Subscription, {
      data: {
        entitlement: { paidUntil: null, active: false, patreon: false, entitled: false },
        admin: false,
        history: [],
        offers: [STRIPE_OFFER],
        canBuy: true,
        processing: 0,
        checkout: null,
        patreon: null,
        patreonDone: null,
        patreonError: null,
        ...data,
      },
      form: data.form ?? null,
      params: {},
    } as never);

  it('prices an offer before tax, and says how paying works', () => {
    show({});
    const offers = screen.getByRole('region', { name: en.subscription_offers_heading });
    expect(offers).toHaveTextContent(fill(en.subscription_price_before_tax, { price: '£30.00' }));
    expect(offers).not.toHaveTextContent('€35.00');
    expect(offers).toHaveTextContent(en.subscription_buy_how);
    expect(within(offers).getByRole('link', { name: en.subscription_buy_terms })).toHaveAttribute('href', '/terms');
    expect(offers).not.toHaveTextContent(en.subscription_buy_soon);
  });

  it('asks once, for every offer, for the consent the terms need, each Buy waiting for it and saying why', async () => {
    show({ offers: [STRIPE_OFFER, { ...STRIPE_OFFER, id: 'o2', name: '1 month' }] });
    const offers = screen.getByRole('region', { name: en.subscription_offers_heading });
    const consents = within(offers).getAllByRole('checkbox', { name: en.subscription_buy_consent });
    expect(consents).toHaveLength(1);
    const buttons = ['12 months', '1 month'].map(name =>
      within(offers).getByRole('button', { name: fill(en.subscription_buy_named, { name }) }),
    );
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(en.subscription_buy_needs_consent);
      expect(button.parentElement).toHaveAttribute('title', en.subscription_buy_needs_consent);
    }
    const sent = () =>
      [...offers.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="consent"]')].map(input => input.value);
    expect(sent()).toEqual(['', '']);

    const [consent] = consents;
    if (consent === undefined) throw new Error('No consent');
    await userEvent.click(consent);
    for (const button of buttons) {
      expect(button).toBeEnabled();
      expect(button.parentElement).not.toHaveAttribute('title');
    }
    expect(sent()).toEqual(['on', 'on']);
  });

  it('offers no button where nothing may be bought, as while an admin views the site as the user', () => {
    show({ canBuy: false });
    expect(screen.queryByRole('button', { name: /12 months/ })).not.toBeInTheDocument();
    expect(screen.getByText(fill(en.subscription_price_before_tax, { price: '£30.00' }))).toBeInTheDocument();
  });

  it.each([
    ['done', en.subscription_checkout_done],
    ['cancelled', en.subscription_checkout_cancelled],
  ])('says how a checkout came back: %s', (checkout, message) => {
    show({ checkout });
    expect(screen.getByRole('status')).toHaveTextContent(message);
  });

  it('says a payment is still being confirmed', () => {
    show({ processing: 1 });
    expect(screen.getByText(en.subscription_checkout_processing)).toBeInTheDocument();
  });

  it.each([
    ['consent', en.subscription_buy_problem_consent],
    ['offer', en.subscription_buy_problem_offer],
    ['stripe', en.subscription_buy_problem_stripe],
    ['impersonating', en.subscription_buy_problem_impersonating],
    ['unknown', en.subscription_buy_problem_stripe],
  ])('says why buying was refused: %s', (buy, message) => {
    show({ form: { buy, offer: 'o1' }, checkout: 'done' });
    expect(screen.getByText(message)).toBeInTheDocument();
    // The problem is said instead of how the checkout came back.
    expect(screen.queryByText(en.subscription_checkout_done)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: en.subscription_buy_consent })).toHaveAttribute(
      'aria-invalid',
      String(buy === 'consent'),
    );
  });
});

describe('the offers page, where the catalogue sells through Stripe', () => {
  const show = (offers: (typeof OFFER)[], form: unknown = null) =>
    render(Offers, {
      data: { offers, refundRequests: [], disputes: [], done: null, stripeCurrency: 'GBP' },
      form,
      params: {},
    } as never);

  it('says which offers are sold through Stripe, and that a price in its currency puts one there', () => {
    show([{ ...OFFER, providers: ['stripe'] }]);
    expect(screen.getByText(en.admin_offer_stripe)).toBeInTheDocument();
    expect(screen.getByText(fill(en.admin_offer_stripe_hint, { currency: 'GBP' }))).toBeInTheDocument();
  });

  it('says when Stripe could not make an offer', () => {
    show([], { problem: 'stripe', name: '12 months' });
    expect(screen.getByText(en.admin_offer_problem_stripe)).toBeInTheDocument();
  });
});

describe("a user's admin page's payments", () => {
  it("links each Stripe payment to Stripe's dashboard, saying which were a sandbox's", () => {
    render(User, {
      data: {
        user: {
          id: 'u1',
          handle: 'amber-fox-oak-01',
          nickname: null,
          name: 'One',
          email: 'one@example.test',
          role: null,
          banned: false,
          createdAt: new Date('2026-11-01T00:00:00Z'),
          image: null,
          banReason: null,
          banExpires: null,
          providers: [],
          sessions: 0,
          admin: false,
          configured: false,
          self: false,
        },
        audit: [],
        done: null,
        refused: null,
        subscription: { paidUntil: UNTIL, active: true },
        credits: ['test', 'live'].map(mode => ({
          id: `c-${mode}`,
          source: 'payment',
          provider: 'stripe',
          externalRef: `pi_${mode}`,
          providerAccount: mode,
          dashboard: `https://dashboard.stripe.com/${mode}/pi_${mode}`,
          months: 12,
          days: 0,
          startsAt: UNTIL,
          endsAt: UNTIL,
          grantedBy: null,
          note: null,
        })),
        patreon: null,
      },
      form: null,
      params: { id: 'u1' },
    } as never);
    const sandbox = screen.getByRole('link', { name: `stripe pi_test (${en.admin_credit_test})` });
    expect(sandbox).toHaveAttribute('href', 'https://dashboard.stripe.com/test/pi_test');
    expect(screen.getByRole('link', { name: 'stripe pi_live' })).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/live/pi_live',
    );
  });
});

describe('the subscription page, to someone with no subscription', () => {
  const show = (data: Record<string, unknown>) =>
    render(Subscription, {
      data: {
        entitlement: { paidUntil: null, active: false, patreon: false, entitled: false },
        admin: false,
        history: [],
        offers: [],
        canBuy: false,
        processing: 0,
        checkout: null,
        patreon: null,
        patreonDone: null,
        patreonError: null,
        ...data,
      },
      form: null,
      params: {},
    } as never);
  const PATREON = { linked: false, subscribed: false, minimum: null, membership: null };

  it.each([
    [{ patreon: PATREON, canBuy: true }, en.subscription_how_both],
    [{ patreon: PATREON }, en.subscription_how_patreon],
    [{ canBuy: true }, en.subscription_how_buy],
  ])('says how they can subscribe, by the ways on offer: %j', (data, how) => {
    show(data);
    expect(screen.getByText(en.subscription_gives, { exact: false })).toHaveTextContent(
      `${en.subscription_gives} ${how}`,
    );
  });

  it('names no way where there is none', () => {
    show({});
    const said = screen.getByText(en.subscription_gives, { exact: false }).textContent;
    expect(said.trim()).toBe(en.subscription_gives);
  });
});

describe("a purchase's refund, on the subscription page", () => {
  const ROW = {
    source: 'payment',
    startsAt: UNTIL,
    endsAt: UNTIL,
    months: 1,
    days: 0,
    purchasedAt: UNTIL,
    paid: { amount: 360, currency: 'GBP' },
  };
  const show = (history: unknown[], more: Record<string, unknown> = {}) =>
    render(Subscription, {
      data: {
        entitlement: { paidUntil: UNTIL, active: true, patreon: false, entitled: true },
        admin: false,
        history,
        offers: [],
        canBuy: true,
        processing: 0,
        checkout: null,
        patreon: null,
        patreonDone: null,
        patreonError: null,
        refundDone: null,
        ...more,
      },
      form: more.form ?? null,
      params: {},
    } as never);

  it('offers to cancel and ask for one where it may be asked, and says where it stands otherwise', () => {
    show([
      { ...ROW, id: 'a', refund: 'refundable' },
      { ...ROW, id: 'b', refund: 'partly' },
      { ...ROW, id: 'c', refund: 'requested' },
      { ...ROW, id: 'd', refund: 'refunded' },
      { ...ROW, id: 'e', refund: null, paid: null, source: 'grant' },
    ]);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    const ask = within(rowOf(rows, 1)).getByRole('button', {
      name: fill(en.subscription_refund_ask_named, { date: day(UNTIL), period: '1 month' }),
    });
    expect(ask).toHaveTextContent(en.subscription_refund_ask);
    expect(rowOf(rows, 2)).toHaveTextContent(en.subscription_refund_partly);
    expect(within(rowOf(rows, 2)).getByRole('button')).toBeInTheDocument();
    expect(rowOf(rows, 3)).toHaveTextContent(en.subscription_refund_requested);
    expect(rowOf(rows, 4)).toHaveTextContent(en.subscription_refund_refunded);
    for (const index of [3, 4, 5]) expect(within(rowOf(rows, index)).queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    ['requested', en.subscription_refund_done],
    ['refunded', en.subscription_refund_done_at_once],
  ])('confirms a refund asked for at once: %s', (refundDone, message) => {
    show([], { refundDone });
    expect(screen.getByRole('status')).toHaveTextContent(message);
  });

  it.each([
    ['credit', en.subscription_refund_problem_credit],
    ['impersonating', en.subscription_buy_problem_impersonating],
    ['unknown', en.subscription_refund_problem_credit],
  ])('says why a refund was refused: %s', (refund, message) => {
    show([], { form: { refund }, refundDone: 'requested' });
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(en.subscription_refund_done)).not.toBeInTheDocument();
  });
});

describe("the offers page's refunds asked for", () => {
  const show = (refundRequests: unknown[]) =>
    render(Offers, {
      data: { offers: [], refundRequests, disputes: [], done: null, stripeCurrency: 'GBP' },
      form: null,
      params: {},
    } as never);

  it('says when none is waiting', () => {
    show([]);
    expect(screen.getByText(en.admin_refunds_none)).toBeInTheDocument();
  });

  it('lists each, with its buyer, the refund owed now, and a link to make it in Stripe', () => {
    show([
      {
        creditId: 'c1',
        userId: 'u1',
        handle: 'amber-fox-oak-01',
        requestedAt: UNTIL,
        purchasedAt: UNTIL,
        startsAt: UNTIL,
        endsAt: UNTIL,
        paid: { amount: 3600, currency: 'GBP' },
        refunded: 0,
        suggested: { amount: 1800, days: 15, of: 30 },
        dashboard: 'https://dashboard.stripe.com/test/payments/pi_1',
      },
      {
        creditId: 'c2',
        userId: 'u2',
        handle: 'bold-owl-elm-02',
        requestedAt: null,
        purchasedAt: UNTIL,
        startsAt: UNTIL,
        endsAt: UNTIL,
        paid: null,
        refunded: 0,
        suggested: null,
        dashboard: null,
      },
    ]);
    const section = screen.getByRole('region', { name: en.admin_refunds_heading });
    expect(section).toHaveTextContent(en.admin_refunds_lede);
    const rows = within(section).getAllByRole('row');
    expect(within(rowOf(rows, 1)).getByRole('link', { name: 'amber-fox-oak-01' })).toHaveAttribute(
      'href',
      '/admin/users/u1',
    );
    expect(rowOf(rows, 1)).toHaveTextContent(fill(en.admin_refunds_suggested, { amount: '£18.00', days: 15, of: 30 }));
    expect(within(rowOf(rows, 1)).getByRole('link', { name: en.admin_refunds_make })).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/test/payments/pi_1',
    );
    expect(within(rowOf(rows, 2)).queryByRole('link', { name: en.admin_refunds_make })).not.toBeInTheDocument();
    expect(rowOf(rows, 2)).toHaveTextContent('–');
  });
});

describe("a user's admin page's refunds and disputes", () => {
  it('says how each payment stands: disputed, refunded, or a refund asked for', () => {
    const credit = (id: string, more: Record<string, unknown>) => ({
      id,
      source: 'payment',
      provider: 'stripe',
      externalRef: `pi_${id}`,
      providerAccount: 'live',
      dashboard: `https://dashboard.stripe.com/payments/pi_${id}`,
      months: 1,
      days: 0,
      startsAt: UNTIL,
      endsAt: UNTIL,
      grantedBy: null,
      note: null,
      currencyPaid: 'GBP',
      refundedAmount: 0,
      refundRequestedAt: null,
      disputed: null,
      ...more,
    });
    render(User, {
      data: {
        user: {
          id: 'u1',
          handle: 'amber-fox-oak-01',
          nickname: null,
          name: 'One',
          email: 'one@example.test',
          role: null,
          banned: false,
          createdAt: UNTIL,
          image: null,
          banReason: null,
          banExpires: null,
          providers: [],
          sessions: 0,
          admin: false,
          configured: false,
          self: false,
        },
        audit: [],
        done: null,
        refused: null,
        subscription: { paidUntil: UNTIL, active: true },
        credits: [
          credit('a', { disputed: 'open' }),
          credit('b', { disputed: 'won' }),
          credit('c', { disputed: 'lost' }),
          credit('d', { refundedAmount: 1800 }),
          credit('e', { refundRequestedAt: UNTIL }),
          credit('f', { disputed: 'odd' }),
        ],
        patreon: null,
      },
      form: null,
      params: { id: 'u1' },
    } as never);
    const section = screen.getByRole('region', { name: en.admin_subscription_heading });
    for (const text of [
      en.admin_credit_disputed_open,
      en.admin_credit_disputed_won,
      en.admin_credit_disputed_lost,
      fill(en.admin_credit_refunded, { amount: '£18.00' }),
      en.subscription_refund_requested,
    ]) {
      expect(section).toHaveTextContent(text);
    }
  });
});

describe("a purchase's refund dialog, on the subscription page", () => {
  const PREVIEW = {
    amount: 1800,
    days: 15,
    of: 30,
    paid: 3600,
    currency: 'GBP',
    countedFrom: UNTIL,
    atOnce: false,
    endsSubscription: true,
  };
  const ROW = {
    id: 'c1',
    source: 'payment',
    startsAt: UNTIL,
    endsAt: UNTIL,
    months: 1,
    days: 0,
    purchasedAt: UNTIL,
    paid: { amount: 3600, currency: 'GBP' },
    refund: 'refundable',
  };
  const show = (preview: unknown) =>
    render(Subscription, {
      data: {
        entitlement: { paidUntil: UNTIL, active: true, patreon: false, entitled: true },
        admin: false,
        history: [{ ...ROW, preview }],
        offers: [],
        canBuy: true,
        processing: 0,
        checkout: null,
        patreon: null,
        patreonDone: null,
        patreonError: null,
        refundDone: null,
      },
      form: null,
      params: {},
    } as never);
  const opened = async () => {
    await userEvent.click(screen.getByRole('button', { name: /Cancel the purchase of/ }));
    return screen.getByRole('dialog');
  };

  it("shows the pro rata refund, what it ends, and asks why, before an admin's refund is asked for", async () => {
    show(PREVIEW);
    const dialog = await opened();
    expect(dialog).toHaveAccessibleName(en.subscription_refund_dialog_request_heading);
    expect(dialog).toHaveTextContent(
      fill(en.subscription_refund_dialog_amount, {
        paid: '£36.00',
        of: 30,
        days: 15,
        date: day(UNTIL),
        amount: '£18.00',
      }),
    );
    expect(dialog).toHaveTextContent(en.subscription_refund_dialog_later);
    expect(dialog).toHaveTextContent(en.subscription_refund_dialog_ends);
    const reason = within(dialog).getByRole('combobox', { name: en.subscription_refund_reason });
    expect(reason).toBeRequired();
    expect(within(dialog).queryByRole('textbox', { name: en.subscription_refund_reason_text })).not.toBeInTheDocument();
    await userEvent.selectOptions(reason, 'other');
    expect(await within(dialog).findByRole('textbox', { name: en.subscription_refund_reason_text })).toBeRequired();
    expect(within(dialog).getByRole('button', { name: en.subscription_refund_confirm })).toHaveAttribute(
      'type',
      'submit',
    );

    await userEvent.click(within(dialog).getByRole('button', { name: en.subscription_refund_dismiss }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancels a purchase within 14 days at once, asking no reason, and warns of nothing it keeps', async () => {
    show({ ...PREVIEW, atOnce: true, endsSubscription: false });
    const dialog = await opened();
    expect(dialog).toHaveAccessibleName(en.subscription_refund_dialog_cancel_heading);
    expect(dialog).toHaveTextContent(en.subscription_refund_dialog_at_once);
    expect(dialog).not.toHaveTextContent(en.subscription_refund_dialog_ends);
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('says what was paid as unknown where it was not kept', async () => {
    show({ ...PREVIEW, paid: null });
    expect(await opened()).toHaveTextContent('You paid – for 30 days');
  });

  it('opens nothing where there is nothing to preview', async () => {
    show(null);
    await userEvent.click(screen.getByRole('button', { name: /Cancel the purchase of/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['reason', en.subscription_refund_problem_reason],
    ['unconfirmed', en.subscription_refund_problem_unconfirmed],
  ])('says why a refund was refused: %s', (refund, message) => {
    render(Subscription, {
      data: {
        entitlement: { paidUntil: null, active: false, patreon: false, entitled: false },
        admin: false,
        history: [],
        offers: [],
        canBuy: false,
        processing: 0,
        checkout: null,
        patreon: null,
        patreonDone: null,
        patreonError: null,
        refundDone: null,
      },
      form: { refund },
      params: {},
    } as never);
    expect(screen.getByText(message)).toBeInTheDocument();
  });
});

describe("the offers page's refund reasons", () => {
  it("shows why each refund was asked for, with the buyer's own words for Other", () => {
    const asked = (creditId: string, reason: string | null, reasonText: string | null) => ({
      creditId,
      userId: 'u1',
      handle: 'amber-fox-oak-01',
      requestedAt: UNTIL,
      purchasedAt: UNTIL,
      startsAt: UNTIL,
      endsAt: UNTIL,
      paid: null,
      refunded: 0,
      suggested: null,
      dashboard: null,
      reason,
      reasonText,
    });
    render(Offers, {
      data: {
        offers: [],
        disputes: [],
        refundRequests: [
          asked('c1', 'too-expensive', null),
          asked('c2', 'other', 'Moving on'),
          asked('c3', null, null),
        ],
        done: null,
        stripeCurrency: 'GBP',
      },
      form: null,
      params: {},
    } as never);
    const rows = within(screen.getByRole('region', { name: en.admin_refunds_heading })).getAllByRole('row');
    expect(rowOf(rows, 1)).toHaveTextContent(en.subscription_refund_reason_too_expensive);
    expect(rowOf(rows, 2)).toHaveTextContent(`${en.subscription_refund_reason_other} Moving on`);
    expect(rowOf(rows, 3)).toHaveTextContent('–');
  });
});

describe('a refund made at once, on the subscription page', () => {
  const ROW = {
    id: 'c1',
    source: 'payment',
    startsAt: UNTIL,
    endsAt: UNTIL,
    months: 1,
    days: 0,
    purchasedAt: UNTIL,
    paid: { amount: 3600, currency: 'GBP' },
    preview: null,
  };
  const show = (refundDone: string | null, refund: string) =>
    render(Subscription, {
      data: {
        entitlement: { paidUntil: UNTIL, active: true, patreon: false, entitled: true },
        admin: false,
        history: [{ ...ROW, refund }],
        offers: [],
        canBuy: true,
        processing: 0,
        checkout: null,
        patreon: null,
        patreonDone: null,
        patreonError: null,
        refundDone,
      },
      form: null,
      params: {},
    } as never);

  afterEach(() => {
    vi.useRealTimers();
    navigation.refreshAll.mockClear();
  });

  it("asks again every two seconds until Stripe's word of it arrives, for a minute at most", () => {
    vi.useFakeTimers();
    show('refunded', 'requested');
    expect(navigation.refreshAll).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(navigation.refreshAll).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    const asked = navigation.refreshAll.mock.calls.length;
    vi.advanceTimersByTime(10_000);
    expect(navigation.refreshAll).toHaveBeenCalledTimes(asked);
  });

  it.each([
    ['once it reads as refunded', 'refunded', 'refunded'],
    ['for a refund an admin is to make', 'requested', 'requested'],
  ])('asks nothing again %s', (_why, refundDone, refund) => {
    vi.useFakeTimers();
    show(refundDone, refund);
    vi.advanceTimersByTime(10_000);
    expect(navigation.refreshAll).not.toHaveBeenCalled();
  });
});

describe("the offers page's outstanding disputes", () => {
  const show = (disputes: unknown[]) =>
    render(Offers, {
      data: { offers: [], refundRequests: [], disputes, done: null, stripeCurrency: 'GBP' },
      form: null,
      params: {},
    } as never);

  it('says when none is waiting', () => {
    show([]);
    expect(screen.getByText(en.admin_disputes_none)).toBeInTheDocument();
  });

  it('lists each below the refunds asked for, with its buyer, when it opened, and where to answer it', () => {
    show([
      {
        creditId: 'c1',
        userId: 'u1',
        handle: 'amber-fox-oak-01',
        openedAt: UNTIL,
        purchasedAt: UNTIL,
        startsAt: UNTIL,
        endsAt: UNTIL,
        paid: { amount: 3600, currency: 'GBP' },
        dashboard: 'https://dashboard.stripe.com/payments/pi_1',
      },
      {
        creditId: 'c2',
        userId: 'u2',
        handle: 'bold-owl-elm-02',
        openedAt: null,
        purchasedAt: UNTIL,
        startsAt: UNTIL,
        endsAt: UNTIL,
        paid: null,
        dashboard: null,
      },
    ]);
    const section = screen.getByRole('region', { name: en.admin_disputes_heading });
    // Just below the refunds asked for.
    expect(section.previousElementSibling).toBe(screen.getByRole('region', { name: en.admin_refunds_heading }));
    expect(section).toHaveTextContent(en.admin_disputes_lede);
    const rows = within(section).getAllByRole('row');
    expect(within(rowOf(rows, 1)).getByRole('link', { name: 'amber-fox-oak-01' })).toHaveAttribute(
      'href',
      '/admin/users/u1',
    );
    expect(rowOf(rows, 1)).toHaveTextContent(day(UNTIL));
    expect(rowOf(rows, 1)).toHaveTextContent('£36.00');
    expect(within(rowOf(rows, 1)).getByRole('link', { name: en.admin_disputes_answer })).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/payments/pi_1',
    );
    expect(within(rowOf(rows, 2)).queryByRole('link', { name: en.admin_disputes_answer })).not.toBeInTheDocument();
    // Its evidence, to download, for every one of them.
    expect(
      within(rowOf(rows, 1)).getByRole('link', {
        name: en.admin_disputes_evidence_named.replace('{handle}', 'amber-fox-oak-01'),
      }),
    ).toHaveAttribute('href', '/admin/subscriptions/evidence/c1');
    expect(within(rowOf(rows, 2)).getByRole('link', { name: /dispute evidence/ })).toHaveAttribute('download');
    expect(section).toHaveTextContent(en.admin_disputes_evidence_hint);
    expect(rowOf(rows, 2)).toHaveTextContent('–');
  });
});

describe('the subscription page, while a payment is disputed', () => {
  it('offers no time to buy, saying why instead', () => {
    render(Subscription, {
      data: {
        entitlement: { paidUntil: UNTIL, active: true, patreon: false, entitled: true },
        admin: false,
        history: [],
        offers: [{ ...OFFER, stripePrice: { currency: 'GBP', amount: 3000 } }],
        canBuy: true,
        disputing: true,
        processing: 0,
        checkout: null,
        patreon: null,
        patreonDone: null,
        patreonError: null,
        refundDone: null,
      },
      form: null,
      params: {},
    } as never);
    const offers = screen.getByRole('region', { name: en.subscription_offers_heading });
    expect(offers).toHaveTextContent(en.subscription_buy_disputed);
    expect(within(offers).queryByRole('button')).not.toBeInTheDocument();
    expect(within(offers).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(offers).not.toHaveTextContent('12 months');
  });
});
