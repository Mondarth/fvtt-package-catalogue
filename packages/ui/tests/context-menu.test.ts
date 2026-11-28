import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeContextMenu, contextMenu, openContextMenu } from '../src/context-menu.js';

import type { MenuItem } from '../src/context-menu.js';

const ITEMS: readonly MenuItem[] = [{ label: 'Add service', onSelect: vi.fn() }];
const menus = () => document.querySelectorAll('[role="menu"]');

/**
 * An element, in the page, that can have the focus.
 * @param name - Its text
 * @returns It
 */
function anElement(name: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.textContent = name;
  document.body.append(element);
  return element;
}

afterEach(() => {
  closeContextMenu();
  document.body.replaceChildren();
});

describe('a context menu', () => {
  it('opens at a point, one at a time, and the second closes the first', () => {
    expect(openContextMenu({ items: ITEMS, label: 'First' }, { x: 10, y: 20 })).toBe(true);
    flushSync();
    expect(openContextMenu({ items: ITEMS, label: 'Second' }, { x: 30, y: 40 })).toBe(true);
    flushSync();
    expect([...menus()].map(menu => menu.getAttribute('aria-label'))).toEqual(['Second']);
  });

  it('opens under an element, and gives the focus back to where it was, on Escape', () => {
    const before = anElement('Before');
    before.focus();
    openContextMenu({ items: ITEMS, label: 'Menu' }, anElement('Under'));
    flushSync();
    expect(document.activeElement).toHaveTextContent('Add service');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(menus()).toHaveLength(0);
    expect(document.activeElement).toBe(before);
  });

  it('closes with the focus where it is, if nothing had it', () => {
    vi.spyOn(document, 'activeElement', 'get').mockReturnValueOnce(null);
    openContextMenu({ items: ITEMS, label: 'Menu' }, { x: 0, y: 0 });
    flushSync();
    document
      .querySelector('[role="menu"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(menus()).toHaveLength(0);
  });

  it('does not open with no entries, and closing none does nothing', () => {
    expect(openContextMenu({ items: [], label: 'Empty' }, { x: 0, y: 0 })).toBe(false);
    closeContextMenu();
    expect(menus()).toHaveLength(0);
  });

  it('closes once, however often it is asked to', () => {
    const onClose = vi.fn();
    openContextMenu({ items: [{ label: 'Go', onSelect: onClose }], label: 'Menu' }, { x: 0, y: 0 }, anElement('Back'));
    flushSync();
    const [entry] = document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    entry?.click();
    closeContextMenu();
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toHaveTextContent('Back');
  });
});

describe('an element with a context menu', () => {
  it('opens it on a right-click, at the pointer, or Shift+F10 or the Menu key, under its anchor, the innermost first', () => {
    const outer = anElement('Outer');
    const inner = anElement('Inner');
    outer.append(inner);
    const anchor = anElement('Anchor');
    const offOuter = contextMenu(() => ({ items: ITEMS, label: 'Outer menu' }))(outer);
    const offInner = contextMenu(() => ({ items: ITEMS, label: 'Inner menu', anchor }))(inner);

    const click = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 6 });
    inner.dispatchEvent(click);
    flushSync();
    expect(click.defaultPrevented).toBe(true);
    expect([...menus()].map(menu => menu.getAttribute('aria-label'))).toEqual(['Inner menu']);

    for (const key of [{ key: 'F10', shiftKey: true }, { key: 'ContextMenu' }]) {
      closeContextMenu();
      outer.dispatchEvent(new KeyboardEvent('keydown', { ...key, bubbles: true, cancelable: true }));
      flushSync();
      expect([...menus()].map(menu => menu.getAttribute('aria-label'))).toEqual(['Outer menu']);
    }

    closeContextMenu();
    const other = new KeyboardEvent('keydown', { key: 'F10', bubbles: true, cancelable: true });
    outer.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    expect(menus()).toHaveLength(0);

    if (typeof offOuter === 'function') offOuter();
    if (typeof offInner === 'function') offInner();
    outer.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(menus()).toHaveLength(0);
  });

  it('with no entries, leaves the browser its own menu, and its parent none', () => {
    const outer = anElement('Outer');
    const inner = anElement('Inner');
    outer.append(inner);
    contextMenu(() => ({ items: ITEMS, label: 'Outer menu' }))(outer);
    contextMenu(() => ({ items: [], label: 'Inner menu' }))(inner);
    const click = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    inner.dispatchEvent(click);
    const keys = new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true });
    inner.dispatchEvent(keys);
    flushSync();
    expect(click.defaultPrevented).toBe(false);
    expect(keys.defaultPrevented).toBe(false);
    expect(menus()).toHaveLength(0);
  });
});
