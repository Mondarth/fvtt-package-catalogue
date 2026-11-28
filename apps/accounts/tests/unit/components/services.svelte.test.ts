import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import Services from '../../../src/routes/admin/services/+page.svelte';
import { messagesOf } from '../support/messages.js';

const en = messagesOf('en');
const fill = (message: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), message);

const at = new Date('2026-11-27T00:00:00Z');
const SERVICES = [
  { id: 'mondarth', name: 'Mondarth', description: 'Everything.', parentId: null, offers: 0 },
  { id: 'apps', name: 'Apps', description: null, parentId: 'mondarth', offers: 0 },
  { id: 'catalogue', name: 'Catalogue', description: null, parentId: 'apps', offers: 2 },
  { id: 'aide', name: 'AIDE', description: null, parentId: 'apps', offers: 0 },
  { id: 'old', name: 'Old beta', description: null, parentId: 'apps', offers: 0, retiredAt: at },
].map(service => ({ createdBy: 'migration', createdAt: at, retiredAt: null, ...service }));

type Form = { problem: string; parent: string; name: string; id: string; description: string } | null;

/**
 * Renders the page.
 * @param added - The one just added
 * @param form - What a failed addition gave back
 * @returns A user to act with
 */
function show(added: string | null = null, form: Form = null) {
  render(Services, { data: { services: SERVICES, added }, form, params: {} } as never);
  return userEvent.setup();
}

describe('the services page', () => {
  it('shows them as a tree, the top one selected beside it', () => {
    show();
    const tree = screen.getByRole('tree', { name: en.admin_services_tree });
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(5);
    expect(within(tree).getByRole('treeitem', { name: /^Catalogue/ })).toHaveTextContent(
      fill(en.admin_service_offers, { count: 2 }),
    );
    expect(within(tree).getByRole('treeitem', { name: /^Old beta/ })).toHaveTextContent(en.admin_service_retired);
    const detail = screen.getByRole('region', { name: 'Mondarth' });
    expect(detail).toHaveTextContent('Everything.');
    expect(detail).toHaveTextContent(en.admin_service_top);
    expect(detail).toHaveTextContent(en.admin_service_gives_under);
  });

  it('selects the one just added, and shows another when it is selected', async () => {
    const user = show('catalogue');
    const detail = screen.getByRole('region', { name: 'Catalogue' });
    expect(detail).toHaveTextContent('catalogue');
    expect(detail).toHaveTextContent('Apps');
    expect(detail).toHaveTextContent(en.admin_service_gives_itself);
    await user.click(screen.getByText('AIDE'));
    expect(screen.getByRole('region', { name: 'AIDE' })).toBeInTheDocument();
  });

  it("adds one under another from its menu, and one at the top from the page's button", async () => {
    const user = show();
    await user.click(screen.getByRole('button', { name: fill(en.admin_service_menu, { name: 'Apps' }) }));
    await user.click(screen.getByRole('menuitem', { name: en.admin_service_add }));
    const dialog = screen.getByRole('dialog', { name: fill(en.admin_service_add_under, { name: 'Apps' }) });
    const form = dialog.querySelector('form');
    expect(form).toHaveAttribute('action', '?/add');
    expect(form?.querySelector('input[name="parent"]')).toHaveValue('apps');
    const box = (name: string) => within(dialog).getByRole('textbox', { name });
    const add = within(dialog).getByRole('button', { name: en.admin_service_add });
    // All three are required, each marked so beside its label, apart from its hint.
    for (const name of [en.admin_service_name, en.admin_service_id, en.admin_service_description]) {
      expect(box(name)).toBeRequired();
      expect(box(name)).toHaveAttribute('aria-required', 'true');
      expect(dialog.querySelector(`label[for="${box(name).id}"] .required`)).toHaveTextContent('*');
    }
    expect(box(en.admin_service_id)).toHaveAccessibleDescription(en.admin_service_id_hint);
    // The id follows the name, and adding waits for all three.
    expect(add).toBeDisabled();
    await user.type(box(en.admin_service_name), 'AIDE Beta');
    expect(box(en.admin_service_id)).toHaveValue('aide-beta');
    expect(add).toBeDisabled();
    await user.type(box(en.admin_service_description), '   ');
    expect(add).toBeDisabled();
    await user.type(box(en.admin_service_description), 'The beta.');
    expect(add).toBeEnabled();
    // An id of the admin's own stays as typed; emptied, it follows the name again.
    await user.clear(box(en.admin_service_id));
    expect(add).toBeDisabled();
    await user.type(box(en.admin_service_id), 'beta');
    await user.type(box(en.admin_service_name), ' Two');
    expect(box(en.admin_service_id)).toHaveValue('beta');
    await user.clear(box(en.admin_service_id));
    await user.type(box(en.admin_service_name), '!');
    expect(box(en.admin_service_id)).toHaveValue('aide-beta-two');
    await user.click(within(dialog).getByRole('button', { name: en.admin_service_cancel }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: en.admin_service_add_top }));
    const top = screen.getByRole('dialog', { name: en.admin_service_add_top });
    expect(top.querySelector('input[name="parent"]')).toHaveValue('');
    // It opens empty again.
    expect(within(top).getByRole('textbox', { name: en.admin_service_name })).toHaveValue('');
    expect(within(top).getByRole('textbox', { name: en.admin_service_id })).toHaveValue('');
  });

  it('offers nothing to do with one retired', async () => {
    const user = show();
    await user.click(screen.getByRole('button', { name: fill(en.admin_service_menu, { name: 'Old beta' }) }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it.each([
    ['name', 'name', en.admin_service_name, en.admin_service_problem_name],
    ['id', 'id', en.admin_service_id, en.admin_service_problem_id],
    ['taken', 'id', en.admin_service_id, en.admin_service_problem_taken],
    ['description', 'description', en.admin_service_description, en.admin_service_problem_description],
  ])('opens a refused addition again, saying what is wrong by its field: %s', (problem, _field, label, says) => {
    show(null, { problem, parent: 'apps', name: 'Catalogue', id: 'catalogue', description: 'More.' });
    const dialog = screen.getByRole('dialog', { name: fill(en.admin_service_add_under, { name: 'Apps' }) });
    const control = within(dialog).getByRole('textbox', { name: label });
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAccessibleDescription(expect.stringContaining(says));
    expect(within(dialog).getByRole('textbox', { name: en.admin_service_name })).toHaveValue('Catalogue');
    expect(within(dialog).getByRole('textbox', { name: en.admin_service_description })).toHaveValue('More.');
  });

  it("keeps a refused id of the admin's own as it was", async () => {
    const user = show(null, { problem: 'taken', parent: 'apps', name: 'Catalogue', id: 'shop', description: 'x' });
    const box = (name: string) => screen.getByRole('textbox', { name });
    await user.type(box(en.admin_service_name), ' two');
    expect(box(en.admin_service_id)).toHaveValue('shop');
  });

  it('lets a refused id made from the name follow it', async () => {
    const user = show(null, { problem: 'taken', parent: 'apps', name: 'Catalogue', id: 'catalogue', description: 'x' });
    const box = (name: string) => screen.getByRole('textbox', { name });
    await user.type(box(en.admin_service_name), ' two');
    expect(box(en.admin_service_id)).toHaveValue('catalogue-two');
  });

  it('says so above the form when the one it was to go under is gone', () => {
    show(null, { problem: 'no-parent', parent: 'gone', name: 'X', id: '', description: '' });
    const dialog = screen.getByRole('dialog', { name: en.admin_service_add_top });
    expect(within(dialog).getByRole('note')).toHaveTextContent(en.admin_service_problem_parent);
    expect(within(dialog).getByRole('textbox', { name: en.admin_service_name })).toHaveAttribute(
      'aria-invalid',
      'false',
    );
  });
});
