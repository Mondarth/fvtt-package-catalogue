/**
 * The design tokens, read from their JSON as the foundations pages show them: the palette's ramps, the theme's
 * colours in light and dark, each site's colour, and the sizes. Read from the tokens themselves, so that the pages
 * cannot drift from them.
 */
import palette from '@mondarth/design-tokens/tokens/base/palette.tokens.json';
import sizes from '@mondarth/design-tokens/tokens/base/size.tokens.json';
import accounts from '@mondarth/design-tokens/tokens/site/accounts.tokens.json';
import aide from '@mondarth/design-tokens/tokens/site/aide.tokens.json';
import catalogue from '@mondarth/design-tokens/tokens/site/catalogue.tokens.json';
import mondarth from '@mondarth/design-tokens/tokens/site/mondarth.tokens.json';
import dark from '@mondarth/design-tokens/tokens/theme/dark.tokens.json';
import light from '@mondarth/design-tokens/tokens/theme/light.tokens.json';

/** A token, as the format writes one: its value, and what it is for. */
interface Token {
  readonly $value: unknown;
  readonly $description?: string;
}

/** A group of tokens, or of groups, with the format's own `$` keys beside them. */
type Group = Readonly<Record<string, unknown>>;

const isToken = (value: unknown): value is Token => typeof value === 'object' && value !== null && '$value' in value;

/** The tokens of a group, by name, in order, its `$` keys and subgroups aside. */
function tokensOf(group: Group): [string, Token][] {
  return Object.entries(group).filter((entry): entry is [string, Token] => isToken(entry[1]));
}

/** A group's subgroups, by name, in order. */
function groupsOf(group: Group): [string, Group][] {
  return Object.entries(group).filter(
    (entry): entry is [string, Group] =>
      !entry[0].startsWith('$') && typeof entry[1] === 'object' && entry[1] !== null && !isToken(entry[1]),
  );
}

/** A colour token's hex. */
function hexOf(token: Token): string {
  const { hex } = token.$value as { hex: string };
  return hex;
}

/** A dimension or duration token as CSS writes it, such as `0.25rem` or `150ms`. */
function cssOf(token: Token): string {
  const { value, unit } = token.$value as { value: number; unit: string };
  return `${String(value)}${unit}`;
}

/** The custom property a token's path names, as the CSS is built: `color.text` is `--mdr-color-text`. */
export const cssVariable = (path: string): string => `--mdr-${path.replaceAll('.', '-')}`;

/** One step of a ramp. */
export interface Step {
  readonly step: string;
  readonly hex: string;
  /** What it is, where it is a logo's colour itself, such as "The crescent, in every logo." */
  readonly pinned: string | undefined;
}

/** A ramp of the palette: a hue, from lightest to darkest. */
export interface Ramp {
  readonly name: string;
  readonly description: string | undefined;
  readonly steps: readonly Step[];
}

/** The palette's ramps, in the order the tokens give them. */
export const ramps: readonly Ramp[] = groupsOf(palette.palette as Group).map(([name, ramp]) => ({
  name,
  description: typeof ramp.$description === 'string' ? ramp.$description : undefined,
  steps: tokensOf(ramp).map(([step, token]) => ({ step, hex: hexOf(token), pinned: token.$description })),
}));

/** The palette's colour a reference such as `{palette.slate.950}` names: its ramp and step, and its hex. */
export function resolve(reference: string): { name: string; hex: string } {
  const [, ramp, step] = /^\{palette\.([\w-]+)\.([\w-]+)\}$/.exec(reference) ?? [];
  const hex = ramps.find(each => each.name === ramp)?.steps.find(each => each.step === step)?.hex;
  if (hex === undefined) throw new Error(`${reference} names no colour of the palette`);
  return { name: `${String(ramp)}.${String(step)}`, hex };
}

/** A colour of the theme, by what it is for, in light and dark. */
export interface ThemeColour {
  readonly name: string;
  readonly description: string | undefined;
  readonly light: { name: string; hex: string };
  readonly dark: { name: string; hex: string };
}

/**
 * The theme's colours, in the order the light theme gives them, each with its dark one.
 *
 * @param lightColours - The light theme's `color` group
 * @param darkColours - The dark theme's
 * @returns Each colour
 */
export function themeColoursOf(lightColours: Group, darkColours: Group): ThemeColour[] {
  const inDark = new Map(tokensOf(darkColours));
  return tokensOf(lightColours).map(([name, token]) => {
    const darkToken = inDark.get(name);
    if (darkToken === undefined) throw new Error(`color.${name} is light only`);
    return {
      name,
      description: token.$description,
      light: resolve(String(token.$value)),
      dark: resolve(String(darkToken.$value)),
    };
  });
}

export const themeColours: readonly ThemeColour[] = themeColoursOf(light.color, dark.color);

/** Each website's own colour, its emblem's. */
export const siteColours: readonly { site: string; description: string | undefined; hex: string; name: string }[] = (
  [
    ['mondarth', mondarth],
    ['catalogue', catalogue],
    ['aide', aide],
    ['accounts', accounts],
  ] as const
).map(([site, tokens]) => {
  const token = tokens.color.site as Token;
  return { site, description: token.$description, ...resolve(String(token.$value)) };
});

/** A size: its token's path, its CSS, and what it is for. */
export interface Size {
  readonly path: string;
  readonly css: string;
  readonly description: string | undefined;
}

/** The tokens of a group of sizes, such as `space` or `font.size`, as CSS. */
function sizesOf(path: string, group: Group): Size[] {
  return tokensOf(group).map(([name, token]) => ({
    path: `${path}.${name}`,
    css: typeof token.$value === 'object' ? cssOf(token) : String(token.$value as number | string),
    description: token.$description,
  }));
}

export const space: readonly Size[] = sizesOf('space', sizes.space);
export const radii: readonly Size[] = sizesOf('radius', sizes.radius);
export const borderWidths: readonly Size[] = sizesOf('border.width', sizes.border.width);
export const layout: readonly Size[] = sizesOf('layout', sizes.layout);
export const fontSizes: readonly Size[] = sizesOf('font.size', sizes.font.size);
export const fontWeights: readonly Size[] = sizesOf('font.weight', sizes.font.weight);
export const lineHeights: readonly Size[] = sizesOf('font.line-height', sizes.font['line-height']);
export const durations: readonly Size[] = sizesOf('duration', sizes.duration);

/** The font families, each as the CSS stack it is. */
export const fontFamilies: readonly Size[] = tokensOf(sizes.font.family).map(([name, token]) => ({
  path: `font.family.${name}`,
  css: (token.$value as string[]).map(face => (/\s/.test(face) ? `"${face}"` : face)).join(', '),
  description: token.$description,
}));
