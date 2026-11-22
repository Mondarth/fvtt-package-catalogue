import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import { PROCESSORS } from '../../../src/lib/processors.js';
import Offers from '../../../src/routes/admin/subscriptions/+page.svelte';
import User from '../../../src/routes/admin/users/[id]/+page.svelte';
import Privacy from '../../../src/routes/privacy/+page.svelte';
import Subscription from '../../../src/routes/subscription/+page.svelte';
import { messagesOf } from '../support/messages.js';

const state = vi.hoisted(() => ({ page: { url: new URL('http://catalogue.test/subscription') } }));
vi.mock('$app/state', () => state);
const navigation = vi.hoisted(() => ({ refreshAll: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/navigation', () => navigation);

const en = messagesOf('en');
const fill = (message: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), message);
const day = (when: Date) => when.toLocaleDateString('en');
const money = (currency: string, minor: number) =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).format(minor / 100);

const CHECKED = new Date('2026-11-20T00:00:00Z');
const NEXT = new Date('2026-12-01T00:00:00Z');
const MINIMUM = { currency: 'GBP', amount: 300 };

/** What Patreon last said, with what differs. */
const membership = (more: Record<string, unknown> = {}) => ({
  patronStatus: 'active_patron',
  amount: 500,
  nextChargeAt: NEXT,
  checkedAt: CHECKED,
  failure: null,
  ...more,
});

describe("the subscription page's Patreon", () => {
  const show = (
    patreon: Record<string, unknown> | null,
    more: { form?: unknown; patreonDone?: string; patreonError?: string; entitlement?: Record<string, unknown> } = {},
  ) =>
    render(Subscription, {
      data: {
        entitlement: { paidUntil: null, active: false, patreon: false, entitled: false, ...more.entitlement },
        admin: false,
        history: [],
        offers: [],
        patreon:
          patreon === null
            ? null
            : { linked: true, subscribed: false, minimum: MINIMUM, membership: membership(), ...patreon },
        patreonDone: more.patreonDone ?? null,
        patreonError: more.patreonError ?? null,
      },
      form: more.form ?? null,
      params: {},
    } as never);

  const section = () => screen.getByRole('region', { name: en.subscription_patreon_heading });

  it('is not shown where the catalogue does not offer Patreon', () => {
    show(null);
    expect(screen.queryByRole('region', { name: en.subscription_patreon_heading })).not.toBeInTheDocument();
  });

  it('offers to link Patreon, saying the least pledge that subscribes', () => {
    show({ linked: false, membership: null });
    expect(section()).toHaveTextContent(fill(en.subscription_patreon_intro, { amount: money('GBP', 300) }));
    expect(within(section()).getByRole('button', { name: en.subscription_patreon_link })).toBeInTheDocument();
  });

  it('says when no least pledge is set', () => {
    show({ linked: false, membership: null, minimum: null });
    expect(section()).toHaveTextContent(en.subscription_patreon_intro_unset);
  });

  it('says a patron is subscribed by their pledge, when Patreon said so and next charges, offering to ask again or unlink', () => {
    show({ subscribed: true }, { entitlement: { patreon: true, entitled: true } });
    expect(screen.getByText(en.subscription_by_patreon)).toBeInTheDocument();
    expect(screen.queryByText(en.subscription_gives)).not.toBeInTheDocument();
    expect(section()).toHaveTextContent(en.subscription_patreon_subscribed);
    // A patron it subscribes is not told how a pledge subscribes.
    expect(section()).not.toHaveTextContent(fill(en.subscription_patreon_intro, { amount: money('GBP', 300) }));
    expect(section()).toHaveTextContent(fill(en.subscription_patreon_checked, { date: day(CHECKED) }));
    expect(section()).toHaveTextContent(fill(en.subscription_patreon_next, { date: day(NEXT) }));
    expect(within(section()).getByRole('button', { name: en.subscription_patreon_check })).toBeInTheDocument();
    expect(within(section()).getByRole('button', { name: en.subscription_patreon_unlink })).toBeInTheDocument();
  });

  it.each([
    [{ amount: 200 }, fill(en.subscription_patreon_below, { amount: money('GBP', 200), minimum: money('GBP', 300) })],
    [{ patronStatus: 'declined_patron' }, en.subscription_patreon_declined],
    [{ patronStatus: 'former_patron' }, en.subscription_patreon_former],
    [{ patronStatus: null, amount: null }, en.subscription_patreon_not_member],
    [{ checkedAt: null, failure: 'unreachable' }, en.subscription_patreon_never],
  ])('says why a pledge does not subscribe: %j', (said, text) => {
    show({ membership: membership(said) });
    expect(section()).toHaveTextContent(text);
    // Linked, but not subscribed by it: still told how a pledge subscribes.
    expect(section()).toHaveTextContent(fill(en.subscription_patreon_intro, { amount: money('GBP', 300) }));
  });

  it('says a patron is one, with no least pledge set', () => {
    show({ minimum: null });
    expect(section()).toHaveTextContent(en.subscription_patreon_no_minimum);
  });

  it('says Patreon has not answered when it never was asked', () => {
    show({ membership: null });
    expect(section()).toHaveTextContent(en.subscription_patreon_never);
  });

  it.each(['revoked', 'scope'])('asks to link Patreon again when %s', failure => {
    show({ membership: membership({ failure }) });
    expect(section()).toHaveTextContent(en.subscription_patreon_relink);
    expect(within(section()).getByRole('button', { name: en.subscription_patreon_link_again })).toBeInTheDocument();
    expect(within(section()).queryByRole('button', { name: en.subscription_patreon_check })).not.toBeInTheDocument();
  });

  it('says what Patreon last said still counts while it cannot be asked', () => {
    show({ subscribed: true, membership: membership({ failure: 'unreachable' }) });
    expect(section()).toHaveTextContent(en.subscription_patreon_unreachable);
  });

  it.each([
    ['linked', en.subscription_patreon_done_linked],
    ['unlinked', en.subscription_patreon_done_unlinked],
    ['checked', en.subscription_patreon_done_checked],
  ])('says it was %s', (done, text) => {
    show({}, { patreonDone: done });
    expect(within(section()).getByRole('status')).toHaveTextContent(text);
  });

  it('ignores what was done that it does not know', () => {
    show({}, { patreonDone: 'other' });
    expect(within(section()).queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    [{ patreonError: 'taken' }, en.subscription_patreon_error_taken],
    [{ patreonError: 'failed' }, en.subscription_patreon_error_failed],
    [{ form: { patreon: 'only' } }, en.subscription_patreon_error_only],
    [{ form: { patreon: 'refused' } }, en.subscription_patreon_error_refused],
    [{ form: { patreon: 'other' } }, en.subscription_patreon_error_refused],
  ])('says what went wrong: %j', (more, text) => {
    show({}, { ...more, patreonDone: 'linked' });
    expect(within(section()).getByRole('alert')).toHaveTextContent(text);
    expect(within(section()).queryByRole('status')).not.toBeInTheDocument();
  });
});

describe("the offers page's least Patreon pledge", () => {
  const show = (patreonMinimum: unknown, form: unknown = null, done: string | null = null) =>
    render(Offers, { data: { offers: [], refundRequests: [], patreonMinimum, done }, form, params: {} } as never);

  it('is not shown where the catalogue does not offer Patreon', () => {
    show(undefined);
    expect(screen.queryByRole('region', { name: en.admin_patreon_heading })).not.toBeInTheDocument();
  });

  it('says the least pledge, or that none is set, and offers to set it', () => {
    show(MINIMUM, null, 'patreon');
    const section = screen.getByRole('region', { name: en.admin_patreon_heading });
    expect(section).toHaveTextContent(fill(en.admin_patreon_set, { amount: money('GBP', 300) }));
    expect(within(section).getByRole('textbox', { name: en.admin_patreon_label })).toHaveAccessibleDescription(
      en.admin_patreon_hint,
    );
    expect(screen.getByRole('status')).toHaveTextContent(en.admin_done_patreon);
    document.body.innerHTML = '';
    show(null);
    expect(screen.getByRole('region', { name: en.admin_patreon_heading })).toHaveTextContent(en.admin_patreon_unset);
  });

  it('says what is wrong with what was given, beside it, keeping it', () => {
    show(null, { minimum: 'five pounds', problem: 'minimum' });
    const field = screen.getByRole('textbox', { name: en.admin_patreon_label });
    expect(field).toHaveValue('five pounds');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(en.admin_patreon_problem);
  });
});

describe("a user's admin page's Patreon", () => {
  const USER = {
    id: 'u1',
    handle: 'handle-ada',
    nickname: null,
    name: 'Ada',
    email: 'ada@example.test',
    image: null,
    role: 'user',
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: CHECKED,
    providers: ['patreon'],
    admin: false,
    configured: false,
    self: false,
  };
  const show = (patreon: unknown) =>
    render(User, {
      data: {
        user: USER,
        audit: [],
        done: null,
        refused: null,
        subscription: { paidUntil: null, active: false },
        credits: [],
        patreon,
      },
      form: null,
      params: { id: 'u1' },
    } as never);

  it('says whether their pledge subscribes them, and what Patreon last said', () => {
    show({ linked: true, subscribed: true, membership: membership() });
    const section = screen.getByRole('region', { name: en.admin_subscription_heading });
    expect(section).toHaveTextContent(en.admin_patreon_subscribes);
    expect(section).toHaveTextContent(
      fill(en.admin_patreon_said, { status: 'active_patron', amount: '500', checked: CHECKED.toLocaleString('en') }),
    );
  });

  it('says why Patreon was last asked without an answer, and what it never said', () => {
    show({
      linked: true,
      subscribed: false,
      membership: membership({ patronStatus: null, amount: null, checkedAt: null, failure: 'unreachable' }),
    });
    const section = screen.getByRole('region', { name: en.admin_subscription_heading });
    expect(section).toHaveTextContent(en.admin_patreon_does_not);
    expect(section).toHaveTextContent(fill(en.admin_patreon_said, { status: '–', amount: '–', checked: '–' }));
    expect(section).toHaveTextContent(fill(en.admin_patreon_failure, { failure: 'unreachable' }));
  });

  it('says nothing of Patreon for someone without it linked, or asked of it', () => {
    show({ linked: false, subscribed: false, membership: null });
    expect(screen.queryByText(en.admin_patreon_does_not)).not.toBeInTheDocument();
    document.body.innerHTML = '';
    show({ linked: true, subscribed: false, membership: null });
    expect(screen.getByText(en.admin_patreon_does_not)).toBeInTheDocument();
    expect(screen.queryByText(/Patreon said/)).not.toBeInTheDocument();
  });
});

describe('the privacy page’s payments', () => {
  it('says the catalogue keeps no payment details, that processors keep invoices, and who each processor is', () => {
    render(Privacy);
    const payments = screen.getByRole('region', { name: en.privacy_payments_heading });
    expect(payments).toHaveTextContent(en.privacy_payments);
    expect(payments).toHaveTextContent(en.privacy_invoices);
    for (const processor of PROCESSORS) {
      const entry = payments.querySelector(`[data-processor="${processor.id}"]`);
      expect(entry).toHaveTextContent(processor.name);
      expect(entry?.textContent).toContain((en as Record<string, string>)[`privacy_processor_${processor.id}_what`]);
      expect(within(entry as HTMLElement).getByRole('link', { name: en.privacy_processor_policy })).toHaveAttribute(
        'href',
        processor.policy,
      );
    }
  });

  it('has an entry for every sign-in provider that is a payment processor', async () => {
    const { PROVIDERS } = await import('../../../src/lib/server/accounts/auth.js');
    const paying = PROVIDERS.filter(provider => provider === 'patreon');
    expect(PROCESSORS.map(processor => processor.id)).toEqual(expect.arrayContaining(paying));
  });
});
