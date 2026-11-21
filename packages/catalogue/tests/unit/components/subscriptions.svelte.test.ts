import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import Offers from '../../../src/routes/admin/subscriptions/+page.svelte';
import User from '../../../src/routes/admin/users/[id]/+page.svelte';
import Subscription from '../../../src/routes/subscription/+page.svelte';
import { messagesOf } from '../support/messages.js';

const state = vi.hoisted(() => ({ page: { url: new URL('http://catalogue.test/admin/subscriptions') } }));
vi.mock('$app/state', () => state);

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
        { id: 'c1', source: 'grant', startsAt: new Date('2026-12-01T00:00:00Z'), endsAt: UNTIL, months: 12, days: 0 },
        { id: 'c2', source: 'other', startsAt: UNTIL, endsAt: UNTIL, months: 0, days: 0 },
      ],
      offers: [OFFER],
    });
    expect(screen.getByText(fill(en.subscription_active, { date: day(UNTIL) }))).toBeInTheDocument();
    const offers = screen.getByRole('region', { name: en.subscription_offers_heading });
    expect(offers).toHaveTextContent('12 months');
    expect(offers).toHaveTextContent('£30.00 · €35.00');
    expect(offers).toHaveTextContent(en.subscription_buy_soon);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(en.subscription_source_grant);
    expect(rows[1]).toHaveTextContent('12 months');
    expect(rows[2]).toHaveTextContent('other');
    expect(rows[2]).toHaveTextContent('–');
  });

  it('says when it ended', () => {
    show({ entitlement: { paidUntil: UNTIL, active: false, entitled: false } });
    expect(screen.getByText(fill(en.subscription_ended, { date: day(UNTIL) }))).toBeInTheDocument();
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
      data: { offers, done: more.done ?? null, stripeCurrency: more.stripe ?? null },
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

  it('prices an offer before tax, asks for the consent the terms need, and says how paying works', () => {
    show({});
    const offers = screen.getByRole('region', { name: en.subscription_offers_heading });
    expect(offers).toHaveTextContent(fill(en.subscription_price_before_tax, { price: '£30.00' }));
    expect(offers).not.toHaveTextContent('€35.00');
    const consent = within(offers).getByRole('checkbox', { name: en.subscription_buy_consent });
    expect(consent).toBeRequired();
    expect(
      within(offers).getByRole('button', { name: fill(en.subscription_buy_named, { name: '12 months' }) }),
    ).toBeInTheDocument();
    expect(offers).toHaveTextContent(en.subscription_buy_how);
    expect(within(offers).getByRole('link', { name: en.subscription_buy_terms })).toHaveAttribute('href', '/terms');
    expect(offers).not.toHaveTextContent(en.subscription_buy_soon);
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
    if (buy === 'consent') {
      expect(screen.getByRole('checkbox', { name: en.subscription_buy_consent })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    }
  });
});

describe('the offers page, where the catalogue sells through Stripe', () => {
  const show = (offers: (typeof OFFER)[], form: unknown = null) =>
    render(Offers, { data: { offers, done: null, stripeCurrency: 'GBP' }, form, params: {} } as never);

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
