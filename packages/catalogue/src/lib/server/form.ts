/**
 * Reading the admin pages' forms: a field, trimmed; a day; and a period of months and days.
 */
import type { Period } from './subscriptions/period.js';

/**
 * A form's field, trimmed; empty if it is not there, or a file.
 *
 * @param form - The form
 * @param name - The field's name
 * @returns Its text
 */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A date field's day, at its start in UTC.
 *
 * @param text - The field, as `YYYY-MM-DD`
 * @returns The day, or none if it is empty or not a day
 */
export function dayOf(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The period a form's `months` and `days` give, an empty one as none of either. It may not be one that can be given:
 * check it with `isPeriod`.
 *
 * @param form - The form
 * @returns The period
 */
export function periodOf(form: FormData): Period {
  return { months: Number(field(form, 'months') || '0'), days: Number(field(form, 'days') || '0') };
}
