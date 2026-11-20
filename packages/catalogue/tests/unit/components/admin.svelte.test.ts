import { render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import AdminLayout from '../../../src/routes/admin/+layout.svelte';
import Audit from '../../../src/routes/admin/audit/+page.svelte';
import User from '../../../src/routes/admin/users/[id]/+page.svelte';
import Users from '../../../src/routes/admin/users/+page.svelte';
import { messagesOf } from '../support/messages.js';

import type { AuditRow } from '../../../src/lib/server/accounts/audit.js';

const state = vi.hoisted(() => ({ page: { url: new URL('http://catalogue.test/admin/users') } }));
vi.mock('$app/state', () => state);

const en = messagesOf('en');
const fill = (message: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), message);

const children = createRawSnippet(() => ({ render: () => '<p>The page</p>' }));

const SUMMARY = {
  id: 'u1',
  handle: 'amber-fox-oak-01',
  nickname: null as string | null,
  name: 'One',
  email: 'one@example.test',
  role: null as string | null,
  banned: false,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  admin: false,
};

const entry = (more: Partial<AuditRow> = {}): AuditRow => ({
  id: 1,
  at: new Date('2026-11-16T10:00:00Z'),
  actorId: 'admin',
  asUserId: null,
  action: 'user.set-role',
  subjectId: 'u1',
  before: { role: 'user' },
  after: { role: 'admin' },
  requestId: null,
  ...more,
});

describe('the admin pages’ frame', () => {
  it('links each admin page, marking the one shown', () => {
    render(AdminLayout, { children, data: {}, params: {} } as never);
    const menu = screen.getByRole('navigation', { name: en.admin_nav_label });
    expect(within(menu).getByRole('link', { name: en.admin_nav_users })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: en.admin_nav_audit })).toHaveAttribute('href', '/admin/audit');
    expect(within(menu).getByRole('link', { name: en.admin_nav_audit })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('The page')).toBeInTheDocument();
  });
});

describe('the list of users', () => {
  const list = (data: Partial<{ search: string; page: number; pages: number; total: number }>, users = [SUMMARY]) =>
    render(Users, {
      data: { search: '', page: 1, pages: 1, total: users.length, users, ...data },
      params: {},
    } as never);

  it('lists the users found, each linked to their page, with their role and whether they are banned', () => {
    list({}, [
      SUMMARY,
      { ...SUMMARY, id: 'u2', nickname: 'Ulenar', handle: 'bold-owl-elm-02', admin: true, banned: true },
    ]);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(fill(en.admin_users_count, { total: 2 }));
    expect(screen.getByRole('link', { name: SUMMARY.handle })).toHaveAttribute('href', '/admin/users/u1');
    const named = screen.getByRole('link', { name: 'Ulenar' }).closest('tr');
    expect(named).toHaveTextContent('bold-owl-elm-02');
    expect(named).toHaveTextContent(en.admin_role_admin);
    expect(named).toHaveTextContent(en.admin_banned);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('says when none is found', () => {
    list({}, []);
    expect(screen.getByText(en.admin_users_none)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('pages through them, keeping the search', () => {
    list({ search: 'amber', page: 2, pages: 3, total: 120 });
    const pages = screen.getByRole('navigation', { name: fill(en.admin_page_of, { page: 2, pages: 3 }) });
    const previous = within(pages).getByRole('button', { name: en.admin_page_previous });
    const next = within(pages).getByRole('button', { name: en.admin_page_next });
    expect(previous).toHaveValue('1');
    expect(next).toHaveValue('3');
    expect(previous.closest('form')?.querySelector('input[name="q"]')).toHaveValue('amber');
  });

  it('offers no page before the first or after the last', () => {
    list({ page: 1, pages: 2, total: 60 });
    expect(screen.queryByRole('button', { name: en.admin_page_previous })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.admin_page_next }).closest('form')?.querySelector('input')).toBeNull();
  });
});

describe("a user's admin page", () => {
  const USER = {
    ...SUMMARY,
    image: null,
    banReason: null as string | null,
    banExpires: null as Date | null,
    providers: ['github'],
    sessions: 2,
    configured: false,
    self: false,
  };

  const page = (
    user: Partial<typeof USER> = {},
    more: {
      done?: string | null;
      refused?: string | null;
      audit?: AuditRow[];
      form?: unknown;
      subscription?: { paidUntil: Date | null; active: boolean };
      credits?: unknown[];
    } = {},
  ) =>
    render(User, {
      data: {
        user: { ...USER, ...user },
        audit: more.audit ?? [],
        done: more.done ?? null,
        refused: more.refused ?? null,
        subscription: more.subscription ?? { paidUntil: null, active: false },
        credits: more.credits ?? [],
        patreon: null,
      },
      form: more.form ?? null,
      params: { id: 'u1' },
    } as never);

  it('shows what is held of them, and offers what an admin may do', () => {
    page();
    expect(screen.getByRole('heading', { level: 1, name: SUMMARY.handle })).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.admin_role_save })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: en.admin_role_heading })).toHaveValue('user');
    expect(screen.getByRole('button', { name: en.admin_ban_button })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.admin_sign_out_button })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.admin_impersonate_button }).closest('form')).toHaveAttribute(
      'action',
      '/admin/users/u1/impersonate',
    );
    expect(screen.getByText(en.admin_audit_none)).toBeInTheDocument();
  });

  it('offers nothing an admin does to others on themselves', () => {
    page({ self: true, admin: true });
    expect(screen.getByText(en.admin_self)).toBeInTheDocument();
    for (const name of [
      en.admin_role_save,
      en.admin_ban_button,
      en.admin_sign_out_button,
      en.admin_impersonate_button,
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByText(en.admin_role_admin)).toBeInTheDocument();
  });

  it('offers no role or ban for an admin ADMIN_USER_IDS names, nor viewing the site as them', () => {
    page({ configured: true, admin: true, banned: true });
    expect(screen.getByText(en.admin_configured)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.admin_role_save })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.admin_unban_button })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.admin_impersonate_button })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.admin_sign_out_button })).toBeInTheDocument();
  });

  it('shows a ban, for good or until when, with its reason, and offers to lift it', () => {
    page({ banned: true, banReason: 'Spam' });
    expect(screen.getByText(en.admin_banned_forever)).toBeInTheDocument();
    expect(screen.getByText(fill(en.admin_banned_reason, { reason: 'Spam' }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.admin_unban_button })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.admin_ban_button })).not.toBeInTheDocument();
  });

  it('shows when a ban ends', () => {
    page({ banned: true, banExpires: new Date('2026-12-01T00:00:00Z') });
    expect(screen.getByText(/2026|12/, { selector: 'p' })).toBeInTheDocument();
  });

  it('says what was done', () => {
    page({}, { done: 'unban' });
    expect(screen.getByRole('status')).toHaveTextContent(en.admin_done_unban);
  });

  it('ignores what it was told was done that it does not know', () => {
    page({}, { done: 'other' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    [{ form: { action: 'role', refusal: 'self' } }, en.admin_refused_self],
    [{ form: { action: 'unban', refusal: null } }, en.admin_refused_failed],
    [{ form: { action: 'ban', refusal: null, problem: 'reason' } }, en.admin_ban_reason_too_long],
    [{ form: { action: 'ban', refusal: null, problem: 'banDays' } }, en.admin_problem_ban_days],
    [{ refused: 'admin' }, en.admin_refused_admin],
    [{ refused: 'unknown' }, en.admin_refused_failed],
  ])('says why something was refused', (more, said) => {
    page({}, more);
    expect(screen.getByRole('alert')).toHaveTextContent(said);
  });

  // Regression: a grant of 10000000000000 months was refused by the server with a small line at the top of the page,
  // where it was easily missed, while the browser flagged a negative one by the field.
  it('says what went wrong beside the form it is about, drawing the eye to it, and marks the fields', () => {
    page({}, { form: { action: 'grant', refusal: null, problem: 'period' } });
    const callout = screen.getByRole('alert');
    expect(callout).toHaveTextContent(en.admin_problem_period);
    expect(callout).toHaveFocus();
    expect(callout.closest('form')).toHaveAttribute('action', '?/grant');
    const months = screen.getByRole('spinbutton', { name: en.admin_grant_months });
    expect(months).toHaveAttribute('aria-invalid', 'true');
    expect(months).toHaveAttribute('aria-describedby', 'grant-problem');
    expect(months).toHaveAttribute('max', '120');
    expect(screen.getByRole('spinbutton', { name: en.admin_grant_days })).toHaveAttribute('max', '3660');
    expect(document.getElementById('grant-note')).toHaveAttribute('aria-invalid', 'false');
  });

  it.each([
    [{ action: 'setEnd', refusal: null, problem: 'date' }, 'setEnd'],
    [{ action: 'ban', refusal: null, problem: 'banDays' }, 'ban'],
    [{ action: 'role', refusal: 'configured' }, 'role'],
    [{ action: 'signOut', refusal: null }, 'sessions'],
  ])('shows a failure of %o in its own section', (form, section) => {
    page({}, { form });
    expect(screen.getByRole('alert')).toHaveAttribute('id', `${section}-problem`);
    expect(screen.getByRole('alert').closest('section')).toHaveAttribute(
      'aria-labelledby',
      section === 'setEnd' ? 'subscription' : section,
    );
  });

  it('shows at the top a refusal to view the site as them, as its section may not be shown', () => {
    page({ admin: true }, { refused: 'admin' });
    const callout = screen.getByRole('alert');
    expect(callout).toHaveAttribute('id', 'top-problem');
    expect(callout.closest('section')).toBeNull();
  });

  it('lists what admins did about them, with what changed', () => {
    page({}, { audit: [entry(), entry({ id: 2, action: 'user.revoke-sessions', before: null, after: null })] });
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(en.audit_action_user_set_role);
    expect(items[0]).toHaveTextContent('role: user → admin');
    expect(items[1]).toHaveTextContent(en.audit_action_user_revoke_sessions);
    expect(screen.getByRole('link', { name: en.admin_nav_audit })).toHaveAttribute('href', '/admin/audit');
  });
});

describe('the audit log page', () => {
  const audit = (entries: AuditRow[], next: number | null = null) =>
    render(Audit, { data: { entries, next }, params: {} } as never);

  it('lists each entry: when, who, as whom, what, to whom, and what changed', () => {
    audit([
      entry(),
      entry({
        id: 2,
        action: 'profile.nickname',
        asUserId: 'u1',
        before: { nickname: null },
        after: { nickname: 'A' },
      }),
      entry({ id: 3, action: 'something.new', subjectId: null, before: null, after: null }),
    ]);
    const rows = screen.getAllByRole('row');
    const row = (index: number): HTMLElement => {
      const found = rows[index];
      if (found === undefined) throw new Error(`No row ${String(index)}`);
      return found;
    };
    expect(rows[1]).toHaveTextContent(en.audit_action_user_set_role);
    expect(within(row(1)).getByRole('link', { name: 'admin' })).toHaveAttribute('href', '/admin/users/admin');
    expect(rows[2]).toHaveTextContent('nickname: – → A');
    expect(within(row(2)).getAllByRole('link', { name: 'u1' })).toHaveLength(2);
    expect(rows[3]).toHaveTextContent('something.new');
    expect(screen.queryByRole('button', { name: en.admin_audit_older })).not.toBeInTheDocument();
  });

  it('offers the older entries when there may be more', () => {
    audit([entry()], 1);
    const older = screen.getByRole('button', { name: en.admin_audit_older });
    expect(older.closest('form')?.querySelector('input[name="before"]')).toHaveValue('1');
  });

  it('says when nothing is recorded yet', () => {
    audit([]);
    expect(screen.getByText(en.admin_audit_none)).toBeInTheDocument();
  });
});
