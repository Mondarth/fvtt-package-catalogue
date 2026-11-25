/**
 * Reads the built CSS's themes and measures their colours' contrast, as WCAG 2.2 counts it, so that a change of palette
 * that leaves some text unreadable fails the tests.
 */

/** One theme: each custom property's value, its aliases resolved. */
export type Theme = ReadonlyMap<string, string>;

/** The rules of `tokens.css` whose custom properties make a theme. */
export interface Themes {
  /** `:root`, as the browser has it with no preference: light. */
  readonly light: Theme;
  /** Dark, as the browser prefers, and as a page asks for it. */
  readonly dark: Theme;
}

const RULE = /([^{}]+)\{([^{}]*)\}/g;
const DECLARATION = /(--[\w-]+)\s*:\s*([^;]+);/g;
const ALIAS = /^var\((--[\w-]+)\)$/;

/**
 * Each rule's custom properties, by its selector, with any wrapping at-rule's own prelude before it.
 *
 * @param css - The CSS, as `tokens.css` is written: no nesting deeper than one at-rule
 * @returns The custom properties of each selector
 */
export function rulesOf(css: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  const plain = css.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  for (const [, prelude = '', body = ''] of plain
    .replaceAll(/@media[^{]+\{/g, match => match.slice(0, -1) + ' ')
    .matchAll(RULE)) {
    const declarations = new Map<string, string>();
    for (const [, name = '', value = ''] of body.matchAll(DECLARATION)) declarations.set(name, value.trim());
    rules.set(prelude.trim().replaceAll(/\s+/g, ' '), declarations);
  }
  return rules;
}

/**
 * A theme: the base's properties, then the theme's own over them, every alias resolved to what it names.
 *
 * @param base - `:root`'s properties
 * @param over - The theme's
 * @returns The theme
 */
export function themeOf(base: ReadonlyMap<string, string>, over: ReadonlyMap<string, string> = new Map()): Theme {
  const merged = new Map([...base, ...over]);
  const resolve = (name: string, seen: readonly string[]): string => {
    const value = merged.get(name);
    if (value === undefined) throw new Error(`${[...seen, name].join(' -> ')} is not defined`);
    const alias = ALIAS.exec(value)?.[1];
    if (alias === undefined) return value;
    if (seen.includes(alias)) throw new Error(`${[...seen, name, alias].join(' -> ')} is circular`);
    return resolve(alias, [...seen, name]);
  };
  return new Map([...merged.keys()].map(name => [name, resolve(name, [])]));
}

/**
 * The light and dark themes of `tokens.css`.
 *
 * @param css - `tokens.css`
 * @returns Its themes
 */
export function themesOf(css: string): Themes {
  const rules = rulesOf(css);
  const rule = (selector: string) => {
    const found = rules.get(selector);
    if (found === undefined) throw new Error(`tokens.css has no rule for ${selector}`);
    return found;
  };
  const root = rule(':root');
  return { light: themeOf(root), dark: themeOf(root, rule("[data-theme='dark']")) };
}

/**
 * A colour's relative luminance.
 *
 * @param hex - `#rgb` or `#rrggbb`
 * @returns Its luminance, 0 to 1
 */
export function luminance(hex: string): number {
  const digits = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex)?.[1];
  if (digits === undefined) throw new Error(`${hex} is not a hex colour`);
  const full = digits.length === 3 ? digits.replaceAll(/(.)/g, '$1$1') : digits;
  const [red = 0, green = 0, blue = 0] = [0, 2, 4].map(at => {
    const channel = Number.parseInt(full.slice(at, at + 2), 16) / 255;
    return channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * The contrast between two colours.
 *
 * @param first - One
 * @param second - The other, in either order
 * @returns The ratio, 1 to 21
 */
export function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}
