<!--
  A tree, as of a hierarchy an admin manages: each node's label, a detail beside it, and its children, which open and
  close. It is one stop on the Tab key; the arrow keys move along it, Right and Left open and close a node or move into
  and out of it, Home and End go to its ends, and Enter or Space selects. Where the application gives a menu of what
  can be done with a node, a right-click, Shift+F10 or the Menu key, or the node's own "⋯" button, opens it there.
-->
<script lang="ts">
  import ContextMenu from './ContextMenu.svelte';
  import { parentIds, visibleRows } from './tree.js';

  import type { MenuItem, TreeNode } from './tree.js';

  interface Props {
    /** The top nodes. */
    nodes: readonly TreeNode[];
    /** What the tree is, for a screen reader, such as "Services". */
    label: string;
    /** The id of the node selected, if any. */
    selected?: string | null;
    /** The ids of the nodes open: all of them, at first. */
    expanded?: string[];
    /** Selects a node, as a click, Enter or Space does. */
    onSelect?: ((node: TreeNode) => void) | undefined;
    /** What can be done with a node, in a menu; none, and there is no menu. */
    menu?: ((node: TreeNode) => readonly MenuItem[]) | undefined;
    /** What a node's menu is, for a screen reader and its "⋯" button, such as "Actions for Catalogue". */
    menuLabel?: (node: TreeNode) => string;
  }

  let {
    nodes,
    label,
    selected = $bindable(null),
    expanded = $bindable(parentIds(nodes)),
    onSelect,
    menu,
    menuLabel = node => node.label,
  }: Props = $props();

  const open = $derived(new Set(expanded));
  const rows = $derived(visibleRows(nodes, open));
  /** The node the Tab key comes to, and the arrow keys move from. */
  let current = $state<string | null>(null);
  const focusable = $derived(
    rows.some(({ node }) => node.id === current) ? current : (selected ?? rows[0]?.node.id ?? null),
  );
  let tree: HTMLUListElement | undefined = $state();
  /** The menu open, if one is: its node's entries, where, and what it is. */
  let opened = $state<{ items: readonly MenuItem[]; x: number; y: number; label: string; id: string } | null>(null);

  const hasChildren = (node: TreeNode) => node.children !== undefined && node.children.length > 0;

  /**
   * Moves the focus to a node's row.
   * @param id - The node's id
   */
  function focus(id: string): void {
    current = id;
    tree?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
  }

  /**
   * Opens a node, or closes it.
   * @param id - The node's id
   * @param on - Open or not
   */
  function toggle(id: string, on: boolean): void {
    expanded = on ? [...new Set([...expanded, id])] : expanded.filter(other => other !== id);
  }

  /**
   * Selects a node.
   * @param node - The node
   */
  function select(node: TreeNode): void {
    selected = node.id;
    current = node.id;
    onSelect?.(node);
  }

  /**
   * Opens a node's menu, where it is asked for.
   * @param node - The node
   * @param x - Where, across the window
   * @param y - Where, down it
   */
  function openMenu(node: TreeNode, x: number, y: number): void {
    const items = menu?.(node) ?? [];
    if (items.length === 0) return;
    current = node.id;
    opened = { items, x, y, label: menuLabel(node), id: node.id };
  }

  /**
   * Opens a node's menu at its row, as from the keyboard or its "⋯" button.
   * @param node - The node
   */
  function openMenuAtRow(node: TreeNode): void {
    const row = tree?.querySelector<HTMLElement>(`[data-id="${CSS.escape(node.id)}"] > .row`);
    const box = row?.getBoundingClientRect();
    openMenu(node, box?.left ?? 0, box?.bottom ?? 0);
  }

  /**
   * Closes the menu open, the focus going back to its node where it should.
   * @param refocus - Whether the focus goes back
   */
  function closeMenu(refocus: boolean): void {
    const back = opened?.id;
    opened = null;
    if (refocus && back !== undefined) focus(back);
  }

  /**
   * Moves along the tree from the keyboard.
   * @param event - The key pressed
   * @param node - The node whose row has the focus
   * @param parent - Its parent's id
   */
  function onKeydown(event: KeyboardEvent, node: TreeNode, parent: string | null): void {
    // Only the row's own keys: not those of what is within it.
    if (event.target !== event.currentTarget) return;
    const at = rows.findIndex(row => row.node.id === node.id);
    const go = (index: number) => {
      const row = rows[index];
      if (row !== undefined) focus(row.node.id);
    };
    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault();
      openMenuAtRow(node);
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        go(at + 1);
        break;
      case 'ArrowUp':
        go(at - 1);
        break;
      case 'Home':
        go(0);
        break;
      case 'End':
        go(rows.length - 1);
        break;
      case 'ArrowRight':
        if (!hasChildren(node)) return;
        if (open.has(node.id)) go(at + 1);
        else toggle(node.id, true);
        break;
      case 'ArrowLeft':
        if (hasChildren(node) && open.has(node.id)) toggle(node.id, false);
        else if (parent !== null) focus(parent);
        else return;
        break;
      case 'Enter':
      case ' ':
        select(node);
        break;
      default:
        return;
    }
    event.preventDefault();
  }
</script>

{#snippet branch(list: readonly TreeNode[], level: number, parent: string | null)}
  {#each list as node (node.id)}
    {@const children = hasChildren(node)}
    <li
      role="treeitem"
      data-id={node.id}
      aria-level={level}
      aria-selected={node.id === selected}
      aria-expanded={children ? open.has(node.id) : undefined}
      tabindex={node.id === focusable ? 0 : -1}
      onkeydown={event => {
        onKeydown(event, node, parent);
      }}
      onfocus={event => {
        if (event.target === event.currentTarget) current = node.id;
      }}
      oncontextmenu={event => {
        if (menu === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        openMenu(node, event.clientX, event.clientY);
      }}>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class={['row', { selected: node.id === selected, muted: node.muted === true }]}
        style:--depth={level - 1}
        onclick={() => {
          select(node);
        }}>
        {#if children}
          <span
            class="caret"
            aria-hidden="true"
            onclick={event => {
              event.stopPropagation();
              toggle(node.id, !open.has(node.id));
            }}>{open.has(node.id) ? '▾' : '▸'}</span>
        {:else}
          <span class="caret" aria-hidden="true"></span>
        {/if}
        <span class="label">{node.label}</span>
        {#if node.detail !== undefined}
          <span class="detail">{node.detail}</span>
        {/if}
        {#if menu !== undefined}
          <button
            type="button"
            class="more"
            tabindex="-1"
            aria-label={menuLabel(node)}
            aria-haspopup="menu"
            onclick={event => {
              event.stopPropagation();
              openMenuAtRow(node);
            }}>⋯</button>
        {/if}
      </div>
      {#if children && open.has(node.id)}
        <ul role="group">
          {@render branch(node.children ?? [], level + 1, node.id)}
        </ul>
      {/if}
    </li>
  {/each}
{/snippet}

<ul class="tree" role="tree" aria-label={label} bind:this={tree}>
  {@render branch(nodes, 1, null)}
</ul>

{#if opened !== null}
  <ContextMenu items={opened.items} x={opened.x} y={opened.y} label={opened.label} onClose={closeMenu} />
{/if}

<style>
  .tree,
  .tree ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  [role='treeitem'] {
    outline: none;
  }

  .row {
    display: flex;
    gap: var(--mdr-space-2);
    align-items: center;
    padding: var(--mdr-space-1) var(--mdr-space-2);
    padding-inline-start: calc(var(--mdr-space-2) + var(--depth) * var(--mdr-space-5));
    border-radius: var(--mdr-radius-small);
    cursor: pointer;
  }

  .row:hover {
    background: var(--mdr-color-subtle);
  }

  [role='treeitem']:focus-visible > .row {
    outline: var(--mdr-border-width-focus) solid var(--mdr-color-focus);
    outline-offset: -2px;
  }

  .row.selected {
    background: var(--mdr-color-subtle);
    box-shadow: inset var(--mdr-border-width-rule) 0 0 var(--mdr-color-accent);
    font-weight: var(--mdr-font-weight-strong);
  }

  .row.muted .label {
    color: var(--mdr-color-text-muted);
  }

  .caret {
    flex: none;
    width: 1em;
    color: var(--mdr-color-text-muted);
    text-align: center;
  }

  .label {
    flex: 1;
    min-width: 0;
  }

  .detail {
    color: var(--mdr-color-text-muted);
    font-size: var(--mdr-font-size-small);
  }

  /* Shown on the row's hover or focus, for a pointer that cannot right-click, such as a finger. */
  .more {
    flex: none;
    padding: 0 var(--mdr-space-2);
    border: 0;
    border-radius: var(--mdr-radius-small);
    background: none;
    color: var(--mdr-color-text-muted);
    font: inherit;
    line-height: 1.4;
    cursor: pointer;
    opacity: 0;
  }

  .row:hover .more,
  [role='treeitem']:focus-visible > .row .more,
  .more:focus-visible {
    opacity: 1;
  }

  .more:hover {
    background: var(--mdr-color-border);
    color: var(--mdr-color-text);
  }

  @media (hover: none) {
    .more {
      opacity: 1;
    }
  }
</style>
