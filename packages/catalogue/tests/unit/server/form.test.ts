import { describe, expect, it } from 'vitest';

import { dayOf, field, periodOf } from '../../../src/lib/server/form.js';

const formOf = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
};

describe('field', () => {
  it('is the field, trimmed, and empty when it is not there or is a file', () => {
    expect(field(formOf({ name: '  Ada  ' }), 'name')).toBe('Ada');
    expect(field(formOf({}), 'name')).toBe('');
    const form = new FormData();
    form.set('upload', new Blob(['x']), 'x.txt');
    expect(field(form, 'upload')).toBe('');
  });
});

describe('dayOf', () => {
  it('is the day, at its start in UTC', () => {
    expect(dayOf('2027-01-31')).toEqual(new Date('2027-01-31T00:00:00Z'));
  });

  it.each(['', 'soon', '2027-1-31', '2027-01-31T10:00', '2027-13-45'])('is none for %j', text => {
    expect(dayOf(text)).toBeNull();
  });
});

describe('periodOf', () => {
  it('reads months and days, an empty one as none', () => {
    expect(periodOf(formOf({ months: '12', days: '' }))).toEqual({ months: 12, days: 0 });
    expect(periodOf(formOf({ days: ' 7 ' }))).toEqual({ months: 0, days: 7 });
    expect(periodOf(formOf({ months: 'x' })).months).toBeNaN();
  });
});
