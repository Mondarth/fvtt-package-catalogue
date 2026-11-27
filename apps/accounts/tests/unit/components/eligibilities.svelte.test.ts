import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import Eligibilities from '../../../src/routes/admin/eligibilities/+page.svelte';
import { messagesOf } from '../support/messages.js';

const en = messagesOf('en');
const fill = (message: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), message);

const at = new Date('2026-11-27T00:00:00Z');
const ELIGIBILITIES = [
  { id: 'mondarth', name: 'Mondarth', description: 'Everything.', parentId: null, offers: 0 },
  { id: 'apps', name: 'Apps', description: null, parentId: 'mondarth', offers: 0 },
  { id: 'catalogue', name: 'Catalogue', description: null, parentId: 'apps', offers: 2 },
  { id: 'aide', name: 'AIDE', description: null, parentId: 'apps', offers: 0 },
  { id: 'old', name: 'Old beta', description: null, parentId: 'apps', offers: 0, retiredAt: at },
].map(eligibility => ({ createdBy: 'migration', createdAt: at, retiredAt: null, ...eligibility }));

type Form = { problem: string; parent: string; name: string; id: string; description: string } | null;

/**
 * Renders the page.
 * @param added - The one just added
 * @param form - What a failed addition gave back
 * @returns A user to act with
 */
function show(added: string | null = null, form: Form = null) {
  render(Eligibilities, { data: { eligibilities: ELIGIBILITIES, added }, form, params: {} } as never);
  return userEvent.setup();
}

describe('the eligibilities page', () => {
  it('shows them as a tree, the top one selected beside it', () => {
    show();
    const tree = screen.getByRole('tree', { name: en.admin_eligibilities_tree });
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(5);
    expect(within(tree).getByRole('treeitem', { name: /^Catalogue/ })).toHaveTextContent(
      fill(en.admin_eligibility_offers, { count: 2 }),
    );
    expect(within(tree).getByRole('treeitem', { name: /^Old beta/ })).toHaveTextContent(en.admin_eligibility_retired);
    const detail = screen.getByRole('region', { name: 'Mondarth' });
    expect(detail).toHaveTextContent('Everything.');
    expect(detail).toHaveTextContent(en.admin_eligibility_top);
    expect(detail).toHaveTextContent(en.admin_eligibility_gives_under);
  });

  it('selects the one just added, and shows another when it is selected', async () => {
    const user = show('catalogue');
    const detail = screen.getByRole('region', { name: 'Catalogue' });
    expect(detail).toHaveTextContent('catalogue');
    expect(detail).toHaveTextContent('Apps');
    expect(detail).toHaveTextContent(en.admin_eligibility_gives_itself);
    await user.click(screen.getByText('AIDE'));
    expect(screen.getByRole('region', { name: 'AIDE' })).toBeInTheDocument();
  });

  it("adds one under another from its menu, and one at the top from the page's button", async () => {
    const user = show();
    await user.click(screen.getByRole('button', { name: fill(en.admin_eligibility_menu, { name: 'Apps' }) }));
    await user.click(screen.getByRole('menuitem', { name: en.admin_eligibility_add }));
    const dialog = screen.getByRole('dialog', { name: fill(en.admin_eligibility_add_under, { name: 'Apps' }) });
    const form = dialog.querySelector('form');
    expect(form).toHaveAttribute('action', '?/add');
    expect(form?.querySelector('input[name="parent"]')).toHaveValue('apps');
    expect(within(dialog).getByLabelText(en.admin_eligibility_name)).toBeRequired();
    await user.click(within(dialog).getByRole('button', { name: en.admin_eligibility_cancel }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: en.admin_eligibility_add_top }));
    const top = screen.getByRole('dialog', { name: en.admin_eligibility_add_top });
    expect(top.querySelector('input[name="parent"]')).toHaveValue('');
  });

  it('offers nothing to do with one retired', async () => {
    const user = show();
    await user.click(screen.getByRole('button', { name: fill(en.admin_eligibility_menu, { name: 'Old beta' }) }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it.each([
    ['name', 'name', en.admin_eligibility_name, en.admin_eligibility_problem_name],
    ['id', 'id', en.admin_eligibility_id, en.admin_eligibility_problem_id],
    ['taken', 'id', en.admin_eligibility_id, en.admin_eligibility_problem_taken],
    ['description', 'description', en.admin_eligibility_description, en.admin_eligibility_problem_description],
  ])('opens a refused addition again, saying what is wrong by its field: %s', (problem, _field, label, says) => {
    show(null, { problem, parent: 'apps', name: 'Catalogue', id: 'catalogue', description: 'More.' });
    const dialog = screen.getByRole('dialog', { name: fill(en.admin_eligibility_add_under, { name: 'Apps' }) });
    const control = within(dialog).getByLabelText(label);
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAccessibleDescription(expect.stringContaining(says));
    expect(within(dialog).getByLabelText(en.admin_eligibility_name)).toHaveValue('Catalogue');
    expect(within(dialog).getByLabelText(en.admin_eligibility_description)).toHaveValue('More.');
  });

  it('says so above the form when the one it was to go under is gone', () => {
    show(null, { problem: 'no-parent', parent: 'gone', name: 'X', id: '', description: '' });
    const dialog = screen.getByRole('dialog', { name: en.admin_eligibility_add_top });
    expect(within(dialog).getByRole('note')).toHaveTextContent(en.admin_eligibility_problem_parent);
    expect(within(dialog).getByLabelText(en.admin_eligibility_name)).toHaveAttribute('aria-invalid', 'false');
  });
});
