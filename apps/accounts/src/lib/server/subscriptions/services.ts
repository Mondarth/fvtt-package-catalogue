/**
 * Services: what a subscription gives access to, such as the catalogue, in a tree (see `schema.ts`). Access to one gives access to every one under it, so a user has access to a service while they have time on it or on any service above it.
 */
import { asc, count, eq, isNull } from 'drizzle-orm';

import { isUniqueViolation } from '../db/errors.js';
import { subscriptionServices, offerServices, subscriptionOffers } from './schema.js';

import type { Database } from '../db/database.js';

/** A service, as an admin sees it. */
export interface Service {
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

/** A service to add. */
export interface ServiceInput {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly parentId: string | null;
  readonly createdBy: string;
}

/** A service in a tree: with those under it. */
export interface ServiceNode extends Service {
  readonly children: readonly ServiceNode[];
}

/**
 * The services as a tree: those at the top, each with those under it, by name.
 * @param list - Every service
 * @returns The top ones
 */
export function serviceTree(list: readonly Service[]): ServiceNode[] {
  const byName = (a: Service, b: Service) => a.name.localeCompare(b.name);
  const under = (parentId: string | null): ServiceNode[] =>
    list
      .filter(service => service.parentId === parentId)
      .sort(byName)
      .map(service => ({ ...service, children: under(service.id) }));
  return under(null);
}

/**
 * The services access to one gives: itself, and every one under it.
 * @param list - Every service
 * @param id - The one with access
 * @returns Their ids
 */
export function reachedFrom(list: readonly Pick<Service, 'id' | 'parentId'>[], id: string): string[] {
  const below = list.filter(service => service.parentId === id).flatMap(child => reachedFrom(list, child.id));
  return [id, ...below];
}

/**
 * The services that give one: itself, and every one above it, nearest first.
 * @param list - Every service
 * @param id - The one wanted
 * @returns Their ids
 */
export function givenBy(list: readonly Pick<Service, 'id' | 'parentId'>[], id: string): string[] {
  const ids: string[] = [];
  const parents = new Map(list.map(service => [service.id, service.parentId]));
  for (let at: string | null | undefined = id; at != null && !ids.includes(at); at = parents.get(at)) ids.push(at);
  return ids;
}

/**
 * Every service, with how many offers on sale add time to it.
 * @param db - The database
 * @returns Them, by name
 */
export async function listServices(db: Database): Promise<Service[]> {
  const [rows, offered] = await Promise.all([
    db.select().from(subscriptionServices).orderBy(asc(subscriptionServices.name)),
    db
      .select({ id: offerServices.serviceId, offers: count() })
      .from(offerServices)
      .innerJoin(subscriptionOffers, eq(subscriptionOffers.id, offerServices.offerId))
      .where(isNull(subscriptionOffers.retiredAt))
      .groupBy(offerServices.serviceId),
  ]);
  const offers = new Map(offered.map(({ id, offers: many }) => [id, many]));
  return rows.map(row => ({ ...row, offers: offers.get(row.id) ?? 0 }));
}

/**
 * Add a service, under another or at the top.
 * @param db - The database
 * @param input - What it is
 * @returns It, or why it could not be: its id is taken, or the one it is to be under is not there, or retired
 */
export async function addService(db: Database, input: ServiceInput): Promise<Service | 'taken' | 'no-parent'> {
  if (input.parentId !== null) {
    const [parent] = await db.select().from(subscriptionServices).where(eq(subscriptionServices.id, input.parentId));
    if (parent?.retiredAt !== null) return 'no-parent';
  }
  try {
    const [added] = await db.insert(subscriptionServices).values(input).returning();
    // An insert's returning always gives the row.
    /* v8 ignore next */
    if (added === undefined) throw new Error('The service was not added');
    return { ...added, offers: 0 };
  } catch (error) {
    if (isUniqueViolation(error)) return 'taken';
    throw error;
  }
}
