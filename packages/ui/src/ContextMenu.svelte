<!--
  A menu of what can be done with something, opened where it is asked for: at the pointer, for a right-click, or at
  the element, from the keyboard (Shift+F10 or the Menu key). The focus moves into it, the arrow keys move along it,
  and Escape, Tab or a click anywhere else closes it, the focus going back where it was. Each entry is the
  application's, in its words.
-->
<script lang="ts">
  import type { MenuItem } from './tree.js';

  interface Props {
    /** The entries. */
    items: readonly MenuItem[];
    /** Where it opens, in the window's coordinates: its top left corner, kept within the window. */
    x: number;
    y: number;
    /** What it is a menu of, for a screen reader, such as "Actions for Catalogue". */
    label: string;
    /** Closes it; `refocus` says whether the focus should go back where it was. */
    onClose: (refocus: boolean) => void;
  }

  let { items, x, y, label, onClose }: Props = $props();

  let menu: HTMLUListElement | undefined = $state();
  /** Where it shows, once measured: moved in from the window's edges. */
  let left = $state(0);
  let top = $state(0);

  const entries = () => [...(menu?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];

  $effect(() => {
    const box = menu?.getBoundingClientRect();
    left = Math.max(0, Math.min(x, window.innerWidth - (box?.width ?? 0)));
    top = Math.max(0, Math.min(y, window.innerHeight - (box?.height ?? 0)));
    entries()[0]?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || menu?.contains(event.target) !== true) onClose(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
    };
  });

  /**
   * Moves along the menu with the arrow keys, Home and End; closes it with Escape or Tab.
   * @param event - The key pressed
   */
  function onKeydown(event: KeyboardEvent): void {
    const list = entries();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const to = (index: number) => {
      event.preventDefault();
      list[(index + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        to(at + 1);
        break;
      case 'ArrowUp':
        to(at - 1);
        break;
      case 'Home':
        to(0);
        break;
      case 'End':
        to(list.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        onClose(true);
        break;
      case 'Tab':
        onClose(true);
        break;
    }
  }

  /**
   * Chooses an entry: the menu closes, the focus going back, then the entry does what it does.
   * @param item - The entry
   */
  function choose(item: MenuItem): void {
    onClose(true);
    item.onSelect();
  }
</script>

<ul
  class="menu"
  role="menu"
  aria-label={label}
  tabindex="-1"
  bind:this={menu}
  style:left="{left}px"
  style:top="{top}px"
  onkeydown={onKeydown}>
  {#each items as item (item.label)}
    <li role="none">
      <button
        type="button"
        role="menuitem"
        disabled={item.disabled}
        onclick={() => {
          choose(item);
        }}>{item.label}</button>
    </li>
  {/each}
</ul>

<style>
  .menu {
    position: fixed;
    z-index: 20;
    display: grid;
    min-width: 12rem;
    margin: 0;
    padding: var(--mdr-space-1) 0;
    border: var(--mdr-border-width-thin) solid var(--mdr-color-border);
    border-radius: var(--mdr-radius-small);
    background: var(--mdr-color-surface);
    list-style: none;
  }

  button {
    display: block;
    box-sizing: border-box;
    width: 100%;
    padding: var(--mdr-space-2) var(--mdr-space-4);
    border: 0;
    background: none;
    color: var(--mdr-color-text);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  button:hover:not([disabled]),
  button:focus-visible {
    outline: none;
    background: var(--mdr-color-subtle);
    color: var(--mdr-color-accent);
  }

  button[disabled] {
    color: var(--mdr-color-text-muted);
    cursor: default;
  }
</style>
