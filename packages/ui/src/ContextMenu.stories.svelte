<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect, fn, userEvent, waitFor } from 'storybook/test';

  import { contextMenu, openContextMenu } from './context-menu.js';
  import ContextMenu from './ContextMenu.svelte';

  import type { ContextMenuOptions } from './context-menu.js';

  /**
   * A menu of what can be done with something. Any element is given one with the `contextMenu` attachment:
   * `<li {@attach contextMenu(() => ({ items, label }))}>`. A right-click opens it at the pointer, and Shift+F10 or the
   * Menu key under the element; a "⋯" button opens the same with `openContextMenu`, for a pointer that cannot
   * right-click. One is open at a time; Escape, Tab, a choice or a click elsewhere closes it, the focus going back.
   */
  const { Story } = defineMeta({ title: 'Navigation/ContextMenu', component: ContextMenu, tags: ['autodocs'] });

  const FILES = ['Terms.md', 'Privacy.md'];
  const chosen = fn();

  /**
   * What can be done with a file.
   * @param file - Its name
   * @returns Its menu
   */
  const menuOf = (file: string): ContextMenuOptions => ({
    label: `Actions for ${file}`,
    items: [
      {
        label: 'Rename',
        onSelect: () => {
          chosen('rename', file);
        },
      },
      { label: 'Delete', disabled: true, onSelect: () => undefined },
      {
        label: 'Download',
        onSelect: () => {
          chosen('download', file);
        },
      },
    ],
  });

  /**
   * The menu open, waited for.
   * @param body - The page's body, where it opens
   * @returns It
   */
  const openMenu = (body: HTMLElement) =>
    waitFor(() => {
      const found = body.querySelector('[role="menu"]');
      if (!(found instanceof HTMLElement)) throw new Error('No menu');
      return found;
    });
</script>

<Story
  name="On any element"
  play={async ({ canvas, canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    const terms = canvas.getByRole('button', { name: 'Terms.md' });
    terms.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }));
    const menu = await openMenu(body);
    await expect(menu).toHaveAccessibleName('Actions for Terms.md');
    await expect(canvas.queryByRole('menu')).toBeNull();
    // Down moves past what is disabled, from Rename to Download.
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(chosen).toHaveBeenCalledWith('download', 'Terms.md');
    await expect(body.querySelector('[role="menu"]')).toBeNull();
    await expect(terms).toHaveFocus();
    // From the keyboard, under the element.
    await userEvent.tab();
    await userEvent.keyboard('{ContextMenu}');
    await expect(await openMenu(body)).toHaveAccessibleName('Actions for Privacy.md');
    await userEvent.keyboard('{Escape}');
    await expect(canvas.getByRole('button', { name: 'Privacy.md' })).toHaveFocus();
    // Its "⋯" button opens the same; a click elsewhere closes it.
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for Terms.md' }));
    await expect(await openMenu(body)).toHaveAccessibleName('Actions for Terms.md');
    await userEvent.click(canvas.getByText('Files'));
    await expect(body.querySelector('[role="menu"]')).toBeNull();
  }}>
  {#snippet template()}
    <p>Files</p>
    <ul aria-label="Files" class="files">
      {#each FILES as file (file)}
        <li>
          <button type="button" class="name" {@attach contextMenu(() => menuOf(file))}>{file}</button>
          <button
            type="button"
            tabindex="-1"
            aria-label={`Actions for ${file}`}
            aria-haspopup="menu"
            onclick={event => {
              openContextMenu(
                menuOf(file),
                event.currentTarget,
                event.currentTarget.previousElementSibling as HTMLElement,
              );
            }}>⋯</button>
        </li>
      {/each}
    </ul>
  {/snippet}
</Story>

<style>
  .files {
    display: grid;
    gap: var(--mdr-space-2);
    max-width: 20rem;
    padding: 0;
    list-style: none;
  }

  .files li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--mdr-space-2) var(--mdr-space-3);
    border: var(--mdr-border-width-thin) solid var(--mdr-color-border);
    border-radius: var(--mdr-radius-small);
  }

  .files button {
    border: 0;
    background: none;
    color: var(--mdr-color-text);
    font: inherit;
    cursor: pointer;
  }
</style>
