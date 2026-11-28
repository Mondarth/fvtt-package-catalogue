/**
 * Context menus: a menu of what can be done with something, opened where it is asked for. Any element can have one,
 * with {@link contextMenu}: a right-click opens it at the pointer, and Shift+F10 or the Menu key opens it under the
 * element. A button, such as a "⋯", opens one with {@link openContextMenu}. One is open at a time; Escape, Tab, a choice
 * or a click anywhere else closes it, the focus going back to where it was asked for, but not after a click elsewhere.
 */
import { mount, unmount } from 'svelte';

import ContextMenu from './ContextMenu.svelte';

import type { Attachment } from 'svelte/attachments';

/** An entry of a context menu. */
export interface MenuItem {
  /** What it says, in the application's words. */
  readonly label: string;
  /** What it does, once chosen; the menu has closed by then. */
  readonly onSelect: () => void;
  /** Shown but not chosen. */
  readonly disabled?: boolean;
}

/** What a context menu holds. */
export interface ContextMenuOptions {
  /** Its entries; with none, there is no menu, and the browser's own shows. */
  readonly items: readonly MenuItem[];
  /** What it is a menu of, for a screen reader, such as "Actions for Catalogue". */
  readonly label: string;
  /** What one opened from the keyboard opens under: the element with the menu, if none is given. */
  readonly anchor?: HTMLElement | null | undefined;
}

/** Where a menu opens: at a point in the window, or under an element, from its left edge. */
export type MenuPlace = { readonly x: number; readonly y: number } | HTMLElement;

/** Closes the menu open, if one is. */
let closeOpen: ((refocus: boolean) => void) | null = null;

/**
 * Opens a context menu, closing any other open.
 * @param options - What it holds
 * @param at - Where it opens
 * @param returnTo - Where the focus goes back to, when it closes: where it is now, if not given
 * @returns Whether it opened: not with no entries
 */
export function openContextMenu(options: ContextMenuOptions, at: MenuPlace, returnTo?: HTMLElement): boolean {
  if (options.items.length === 0) return false;
  closeContextMenu();
  let x: number;
  let y: number;
  if (at instanceof HTMLElement) {
    const box = at.getBoundingClientRect();
    x = box.left;
    y = box.bottom;
  } else {
    ({ x, y } = at);
  }
  // What has the focus is an HTML or SVG element, either of which takes it back.
  const back = returnTo ?? (document.activeElement as HTMLElement | SVGElement | null);
  // Called while it is the one open: opening another closes it first, which ends what could call it.
  const close = (refocus: boolean) => {
    closeOpen = null;
    void unmount(menu);
    if (refocus) back?.focus();
  };
  const menu = mount(ContextMenu, {
    target: document.body,
    props: { items: options.items, x, y, label: options.label, onClose: close },
  });
  closeOpen = close;
  return true;
}

/** Closes the context menu open, if one is, leaving the focus where it is. */
export function closeContextMenu(): void {
  closeOpen?.(false);
}

/**
 * Gives an element a context menu: `<li {@attach contextMenu(() => ({ items, label }))}>`. The innermost element with
 * one has the right-click and the keys, so that one within another opens its own, or none, never its parent's.
 * @param options - What the menu holds, asked for each time it opens
 * @returns The attachment
 */
export function contextMenu(options: () => ContextMenuOptions): Attachment<HTMLElement> {
  return element => {
    const onContextMenu = (event: MouseEvent) => {
      event.stopPropagation();
      if (openContextMenu(options(), { x: event.clientX, y: event.clientY }, element)) event.preventDefault();
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (!((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu')) return;
      event.stopPropagation();
      const asked = options();
      if (openContextMenu(asked, asked.anchor ?? element, element)) event.preventDefault();
    };
    element.addEventListener('contextmenu', onContextMenu);
    element.addEventListener('keydown', onKeydown);
    return () => {
      element.removeEventListener('contextmenu', onContextMenu);
      element.removeEventListener('keydown', onKeydown);
    };
  };
}
