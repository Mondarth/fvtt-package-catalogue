import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { contrast, luminance, rulesOf, themeOf, themesOf } from '../src/contrast.js';

const css = readFileSync(new URL('../dist/tokens.css', import.meta.url), 'utf8');
const rules = rulesOf(css);
const themes = themesOf(css);

/** Text, and what it is set on, in every theme: each must reach WCAG's AA for body text, 4.5:1. */
const TEXT = ['text', 'text-muted', 'accent', 'danger', 'warning', 'success', 'info'];
const BACKGROUNDS = ['background', 'surface', 'subtle'];

/** What must stand out from what is around it, though it is not text: WCAG's 3:1 (Sec. 1.4.11). */
const NON_TEXT = ['border-strong', 'focus'];

const colour = (theme: 'light' | 'dark', name: string) => {
  const value = themes[theme].get(`--mdr-color-${name}`);
  if (value === undefined) throw new Error(`no --mdr-color-${name} in ${theme}`);
  return value;
};

describe('the built tokens', () => {
  it.each(['light', 'dark'] as const)('make text readable on every background, %s', theme => {
    for (const text of TEXT)
      for (const background of BACKGROUNDS)
        expect(
          contrast(colour(theme, text), colour(theme, background)),
          `${text} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colour(theme, 'text-on-accent'), colour(theme, 'accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colour(theme, 'text-on-action'), colour(theme, 'action'))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)('make controls and focus stand out, %s', theme => {
    for (const control of NON_TEXT)
      for (const background of BACKGROUNDS)
        expect(
          contrast(colour(theme, control), colour(theme, background)),
          `${control} on ${background}`,
        ).toBeGreaterThanOrEqual(3);
  });

  it('give dark the same colours whether the browser prefers it or the page asks for it, and light likewise', () => {
    const dark = rules.get("@media (prefers-color-scheme: dark) :root:not([data-theme='light'])");
    expect(dark).toEqual(rules.get("[data-theme='dark']"));
    const light = rules.get("[data-theme='light']");
    expect(light?.size).toBeGreaterThan(0);
    for (const [name, value] of light ?? []) expect(rules.get(':root')?.get(name), name).toBe(value);
  });

  it('change nothing but colours between the themes', () => {
    expect([...(rules.get("[data-theme='dark']")?.keys() ?? [])].every(name => name.startsWith('--mdr-color-'))).toBe(
      true,
    );
  });

  it("give each site its emblem's colour, and nothing else, where a page says which it is", () => {
    const sites = { mondarth: '#f3891c', catalogue: '#efbb47', aide: '#2ff9e3', accounts: '#60b6fa' };
    for (const [site, emblem] of Object.entries(sites)) {
      const rule = rules.get(`[data-site='${site}']`);
      expect([...(rule?.keys() ?? [])], site).toEqual(['--mdr-color-site']);
      expect(themeOf(rules.get(':root') ?? new Map(), rule).get('--mdr-color-site'), site).toBe(emblem);
    }
    expect(themes.light.get('--mdr-color-site')).toBe(sites.mondarth);
  });

  it('name every variable --mdr-', () => {
    expect([...themes.light.keys()].every(name => name.startsWith('--mdr-'))).toBe(true);
  });
});

describe('reading the tokens', () => {
  it('says what is missing or circular', () => {
    expect(() => themeOf(new Map([['--a', 'var(--b)']]))).toThrow('--a -> --b is not defined');
    expect(() =>
      themeOf(
        new Map([
          ['--a', 'var(--b)'],
          ['--b', 'var(--a)'],
        ]),
      ),
    ).toThrow('--a -> --b -> --a is circular');
    expect(() => themesOf('.x { --a: 1; }')).toThrow('tokens.css has no rule for :root');
    expect(() => themesOf(':root { --a: 1; }')).toThrow("tokens.css has no rule for [data-theme='dark']");
  });

  it('measures contrast as WCAG does', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(luminance('#ffffff')).toBe(1);
    expect(() => luminance('red')).toThrow('red is not a hex colour');
  });
});
