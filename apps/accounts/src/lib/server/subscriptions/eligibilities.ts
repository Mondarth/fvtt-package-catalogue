/**
 * Eligibilities: what a subscription gives, such as the catalogue's, in a tree (see `schema.ts`). Holding one holds every
 * one under it, so a user holds an eligibility while they have time on it or on any eligibility above it.
 */
import { asc, count, eq, isNull } from 'drizzle-orm';

import { isUniqueViolation } from '../db/errors.js';
import { eligibilities, offerEligibilities, subscriptionOffers } from './schema.js';

import type { Database } from '../db/database.js';

/** An eligibility, as an admin sees it. */
export interface Eligibility {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly parentId: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly retiredAt: Date | null;
  /** How many offers on sale, not retired, add time to it. */
  readonly offers: number;
}

/** An eligibility to add. */
export interface EligibilityInput {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly parentId: string | null;
  readonly createdBy: string;
}

/** An eligibility in a tree: with those under it. */
export interface EligibilityNode extends Eligibility {
  readonly children: readonly EligibilityNode[];
}

/** What an eligibility's id may be: lower-case letters, digits and single dashes, as `catalogue` or `aide-beta`. */
export const ELIGIBILITY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The longest an eligibility's id or name may be. */
export const ELIGIBILITY_ID_MAX = 40;
export const ELIGIBILITY_NAME_MAX = 80;

/**
 * An id for an eligibility, from its name: `AIDE beta` is `aide-beta`.
 * @param name - Its name
 * @returns The id; empty where the name has no letters or digits
 */
export function eligibilityIdOf(name: string): string {
  return name
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, ELIGIBILITY_ID_MAX)
    .replace(/-+$/, '');
}

/**
 * The eligibilities as a tree: those at the top, each with those under it, by name.
 * @param list - Every eligibility
 * @returns The top ones
 */
export function eligibilityTree(list: readonly Eligibility[]): EligibilityNode[] {
  const byName = (a: Eligibility, b: Eligibility) => a.name.localeCompare(b.name);
  const under = (parentId: string | null): EligibilityNode[] =>
    list
      .filter(eligibility => eligibility.parentId === parentId)
      .sort(byName)
      .map(eligibility => ({ ...eligibility, children: under(eligibility.id) }));
  return under(null);
}

/**
 * The eligibilities holding one gives: itself, and every one under it.
 * @param list - Every eligibility
 * @param id - The one held
 * @returns Their ids
 */
export function heldBy(list: readonly Pick<Eligibility, 'id' | 'parentId'>[], id: string): string[] {
  const below = list.filter(eligibility => eligibility.parentId === id).flatMap(child => heldBy(list, child.id));
  return [id, ...below];
}

/**
 * The eligibilities that give one: itself, and every one above it, nearest first.
 * @param list - Every eligibility
 * @param id - The one wanted
 * @returns Their ids
 */
export function givenBy(list: readonly Pick<Eligibility, 'id' | 'parentId'>[], id: string): string[] {
  const ids: string[] = [];
  const parents = new Map(list.map(eligibility => [eligibility.id, eligibility.parentId]));
  for (let at: string | null | undefined = id; at != null && !ids.includes(at); at = parents.get(at)) ids.push(at);
  return ids;
}

/**
 * Every eligibility, with how many offers on sale add time to it.
 * @param db - The database
 * @returns Them, by name
 */
export async function listEligibilities(db: Database): Promise<Eligibility[]> {
  const [rows, offered] = await Promise.all([
    db.select().from(eligibilities).orderBy(asc(eligibilities.name)),
    db
      .select({ id: offerEligibilities.eligibilityId, offers: count() })
      .from(offerEligibilities)
      .innerJoin(subscriptionOffers, eq(subscriptionOffers.id, offerEligibilities.offerId))
      .where(isNull(subscriptionOffers.retiredAt))
      .groupBy(offerEligibilities.eligibilityId),
  ]);
  const offers = new Map(offered.map(({ id, offers: many }) => [id, many]));
  return rows.map(row => ({ ...row, offers: offers.get(row.id) ?? 0 }));
}

/**
 * Add an eligibility, under another or at the top.
 * @param db - The database
 * @param input - What it is
 * @returns It, or why it could not be: its id is taken, or the one it is to be under is not there, or retired
 */
export async function addEligibility(
  db: Database,
  input: EligibilityInput,
): Promise<Eligibility | 'taken' | 'no-parent'> {
  if (input.parentId !== null) {
    const [parent] = await db.select().from(eligibilities).where(eq(eligibilities.id, input.parentId));
    if (parent?.retiredAt !== null) return 'no-parent';
  }
  try {
    const [added] = await db.insert(eligibilities).values(input).returning();
    // An insert's returning always gives the row.
    /* v8 ignore next */
    if (added === undefined) throw new Error('The eligibility was not added');
    return { ...added, offers: 0 };
  } catch (error) {
    if (isUniqueViolation(error)) return 'taken';
    throw error;
  }
}
