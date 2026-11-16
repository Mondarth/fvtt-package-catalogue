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
  providers: [],
  availableFrom: null as Date | null,
  availableUntil: null as Date | null,
  retiredAt: null as Date | null,
  createdBy: 'admin',
  createdAt: new Date('2026-11-01T00:00:00Z'),
};

describe('the subscription page', () => {
  const show = (data: Record<string, unknown>) =>
    render(Subscription, {
      data: {
        entitlement: { paidUntil: null, active: false, entitled: false },
        admin: false,
        history: [],
        offers: [],
        ...data,
      },
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
  const show = (offers: (typeof OFFER)[], more: { done?: string | null; form?: unknown } = {}) =>
    render(Offers, { data: { offers, done: more.done ?? null }, form: more.form ?? null, params: {} } as never);

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
