<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect, fn, userEvent, waitFor } from 'storybook/test';

  import Tree from './Tree.svelte';

  import type { TreeNode } from './tree.js';

  /**
   * A tree of a hierarchy an admin manages, such as the services a subscription gives. One stop on the Tab key:
   * the arrow keys move along it and open and close its nodes, Enter or Space selects. Where the application gives a
   * menu of what can be done with a node, a right-click, Shift+F10 or the Menu key, or the node's "⋯" button opens it.
   */
  const { Story } = defineMeta({ title: 'Navigation/Tree', component: Tree, tags: ['autodocs'] });

  const SERVICES: readonly TreeNode[] = [
    {
      id: 'mondarth',
      label: 'Mondarth',
      detail: 'everything',
      children: [
        {
          id: 'apps',
          label: 'Apps',
          detail: 'Patreon',
          children: [
            { id: 'catalogue', label: 'Catalogue', detail: '3 offers' },
            { id: 'aide', label: 'AIDE' },
            { id: 'old', label: 'Old beta', muted: true },
          ],
        },
      ],
    },
  ];

  const added = fn();
</script>

<Story
  name="Services"
  play={async ({ canvas }) => {
    const tree = canvas.getByRole('tree', { name: 'Services' });
    await expect(canvas.getAllByRole('treeitem')).toHaveLength(5);
    // One stop on the Tab key: the first node.
    await userEvent.tab();
    const mondarth = canvas.getByRole('treeitem', { name: /^Mondarth/ });
    await expect(mondarth).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('treeitem', { name: /^Apps/ })).toHaveFocus();
    // Left closes it; Right opens it again, then moves into it.
    await userEvent.keyboard('{ArrowLeft}');
    await expect(canvas.getByRole('treeitem', { name: /^Apps/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('treeitem', { name: /^Catalogue/ })).toBeNull();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(canvas.getByRole('treeitem', { name: /^Catalogue/ })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('treeitem', { name: /^Catalogue/ })).toHaveAttribute('aria-selected', 'true');
    // Left from a leaf goes to its parent; End to the last node, Home to the first.
    await userEvent.keyboard('{ArrowLeft}');
    await expect(canvas.getByRole('treeitem', { name: /^Apps/ })).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect(canvas.getByRole('treeitem', { name: /^Old beta/ })).toHaveFocus();
    // Right on a node with no children stays where it is.
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('treeitem', { name: /^Old beta/ })).toHaveFocus();
    // Without a menu, a right-click is the browser's own.
    const right = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    canvas.getByRole('treeitem', { name: /^Old beta/ }).dispatchEvent(right);
    await expect(right.defaultPrevented).toBe(false);
    await userEvent.keyboard('{Home}');
    await expect(mondarth).toHaveFocus();
    // A click selects; its caret opens and closes it.
    await userEvent.click(canvas.getByText('AIDE'));
    await expect(canvas.getByRole('treeitem', { name: /^AIDE/ })).toHaveAttribute('aria-selected', 'true');
    await expect(tree.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    const caret = canvas.getByRole('treeitem', { name: /^Mondarth/ }).querySelector('.caret');
    if (caret instanceof HTMLElement) await userEvent.click(caret);
    await expect(canvas.getAllByRole('treeitem')).toHaveLength(1);
    // Keys a row does not use pass by; at the top, Up goes nowhere, and Left, with nothing to close, too.
    await userEvent.keyboard('{a}{ArrowUp}{ArrowLeft}');
    await expect(canvas.getByRole('treeitem', { name: /^Mondarth/ })).toHaveFocus();
  }}>
  {#snippet template()}
    <Tree nodes={SERVICES} label="Services" />
  {/snippet}
</Story>

<Story
  name="With a menu of actions"
  play={async ({ canvas, canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    const catalogue = canvas.getByRole('treeitem', { name: /^Catalogue/ });
    // A right-click opens the node's menu, the focus in it.
    catalogue
      .querySelector('.row')
      ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }));
    const menu = await waitFor(() => {
      const found = body.querySelector('[role="menu"]');
      if (!(found instanceof HTMLElement)) throw new Error('No menu');
      return found;
    });
    await expect(menu).toHaveAccessibleName('Actions for Catalogue');
    const add = menu.querySelector('[role="menuitem"]');
    await expect(add).toHaveFocus();
    await expect(add).toHaveTextContent('Add service');
    // The arrow keys move along it, past what is disabled; Escape closes it, the focus back on the node.
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{End}{Home}{Escape}');
    await expect(body.querySelector('[role="menu"]')).toBeNull();
    await expect(catalogue).toHaveFocus();
    // From the keyboard: Shift+F10, then choosing it.
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await userEvent.keyboard('{Enter}');
    await expect(added).toHaveBeenCalledWith('catalogue');
    await expect(catalogue).toHaveFocus();
    // The Menu key, then Tab away closes it.
    await userEvent.keyboard('{ContextMenu}');
    await expect(body.querySelector('[role="menu"]')).not.toBeNull();
    await userEvent.tab();
    await expect(body.querySelector('[role="menu"]')).toBeNull();
    // The "⋯" button, for a pointer that cannot right-click; a click elsewhere closes it.
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for AIDE' }));
    await expect(body.querySelector('[role="menu"]')).toHaveAccessibleName('Actions for AIDE');
    await userEvent.click(canvas.getByRole('tree'));
    await expect(body.querySelector('[role="menu"]')).toBeNull();
    // A node with nothing to do opens no menu.
    await userEvent.click(canvas.getByText('Old beta'));
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await expect(body.querySelector('[role="menu"]')).toBeNull();
  }}>
  {#snippet template()}
    <Tree
      nodes={SERVICES}
      label="Services"
      menuLabel={(node: TreeNode) => `Actions for ${node.label}`}
      menu={(node: TreeNode) =>
        node.muted === true
          ? []
          : [
              {
                label: 'Add service',
                onSelect: () => {
                  added(node.id);
                },
              },
              { label: 'Retire', onSelect: () => undefined, disabled: true },
              { label: 'Rename', onSelect: () => undefined },
            ]} />
  {/snippet}
</Story>

<Story
  name="A menu named by its node"
  play={async ({ canvas }) => {
    // Without words of the application's, a node's menu is named by its label.
    await expect(canvas.getByRole('button', { name: 'Catalogue' })).toHaveAttribute('aria-haspopup', 'menu');
  }}>
  {#snippet template()}
    <Tree
      nodes={[{ id: 'catalogue', label: 'Catalogue' }]}
      label="Services"
      menu={() => [{ label: 'Add service', onSelect: () => undefined }]} />
  {/snippet}
</Story>
