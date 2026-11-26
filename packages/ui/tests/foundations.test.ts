import { describe, expect, it } from 'vitest';

import {
  borderWidths,
  cssVariable,
  durations,
  fontFamilies,
  fontSizes,
  fontWeights,
  layout,
  lineHeights,
  radii,
  ramps,
  resolve,
  siteColours,
  space,
  themeColours,
  themeColoursOf,
} from '../src/foundations/tokens.js';

describe('the tokens, as the foundations pages read them', () => {
  it("give the palette's ramps, the logos' colours pinned at their steps", () => {
    expect(ramps.map(ramp => ramp.name)).toEqual(['turquoise', 'gold', 'orange', 'slate', 'red', 'green', 'blue']);
    const crescent = ramps[0]?.steps.find(step => step.step === '200');
    expect(crescent).toEqual({ step: '200', hex: '#2ff9e3', pinned: 'The crescent, in every logo.' });
    expect(ramps.find(ramp => ramp.name === 'red')?.description).toBeUndefined();
    expect(ramps.find(ramp => ramp.name === 'slate')?.steps[0]).toEqual({
      step: '0',
      hex: '#ffffff',
      pinned: undefined,
    });
  });

  it("give the theme's colours, each in light and dark, by what it is for", () => {
    const text = themeColours.find(colour => colour.name === 'text');
    expect(text).toEqual({
      name: 'text',
      description: 'Text, on any of the backgrounds.',
      light: { name: 'slate.950', hex: '#11191a' },
      dark: { name: 'slate.100', hex: '#e8eeef' },
    });
    expect(themeColours.map(colour => colour.name)).toContain('action');
  });

  it('refuse a theme whose colour is light only, or names no colour of the palette', () => {
    const colour = (value: string) => ({ $value: value });
    expect(() => themeColoursOf({ text: colour('{palette.slate.950}') }, {})).toThrow('color.text is light only');
    expect(() => resolve('{palette.slate.1}')).toThrow('{palette.slate.1} names no colour of the palette');
    expect(() => resolve('{palette.mauve.50}')).toThrow('names no colour of the palette');
    expect(() => resolve('#ffffff')).toThrow('names no colour of the palette');
  });

  it("give each site its emblem's colour", () => {
    expect(siteColours.map(({ site, hex }) => [site, hex])).toEqual([
      ['mondarth', '#f3891c'],
      ['catalogue', '#efbb47'],
      ['aide', '#2ff9e3'],
      ['accounts', '#60b6fa'],
    ]);
  });

  it('give the sizes as CSS writes them, with the custom property each is', () => {
    expect(space[0]).toEqual({ path: 'space.1', css: '0.25rem', description: undefined });
    expect(space).toHaveLength(7);
    expect(radii.map(size => size.css)).toEqual(['0.375rem', '999px']);
    expect(borderWidths.map(size => size.path)).toEqual([
      'border.width.thin',
      'border.width.focus',
      'border.width.rule',
    ]);
    expect(layout[0]?.css).toBe('48rem');
    expect(fontSizes.map(size => size.css)).toEqual(['0.9rem', '1rem', '1.1rem', '1.6rem']);
    expect(fontWeights.map(size => size.css)).toEqual(['400', '600']);
    expect(lineHeights.map(size => size.css)).toEqual(['1.5', '1.2']);
    expect(durations.map(size => size.css)).toEqual(['150ms', '300ms']);
    expect(fontFamilies[0]?.css).toBe('system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
    expect(cssVariable('font.line-height.body')).toBe('--mdr-font-line-height-body');
  });
});
