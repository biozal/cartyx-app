import { readFileSync } from 'node:fs';

/**
 * An ObjectId as the Python builder assigned it. Kept distinct from a plain string so
 * each writer can decide what an id becomes: a hex string in the graph, an ObjectId in
 * MongoDB while a subsystem is still there.
 */
export class PlanId {
  constructor(readonly hex: string) {
    if (!/^[0-9a-f]{24}$/.test(hex)) throw new Error('Seed plan id is not 24 hex characters');
  }
  toString() {
    return this.hex;
  }
}

export type PlanValue =
  string | number | boolean | null | Date | PlanId | PlanValue[] | { [key: string]: PlanValue };
export type PlanDocument = { [key: string]: PlanValue };

/** One document the Python builder produced, with its id already assigned. */
export interface PlanEntry {
  collection: string;
  document: PlanDocument;
}

/**
 * The builder writes MongoDB extended JSON (relaxed), so ids and dates survive the
 * language boundary. Only the forms it produces are accepted; anything else in a
 * `$`-keyed object is refused rather than passed through as data.
 */
function revive(value: unknown): PlanValue {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 1 && keys[0] === '$oid' && typeof record.$oid === 'string')
      return new PlanId(record.$oid);
    if (keys.length === 1 && keys[0] === '$date') {
      const raw = record.$date;
      const millis =
        typeof raw === 'string'
          ? Date.parse(raw)
          : raw && typeof raw === 'object' && '$numberLong' in raw
            ? Number((raw as { $numberLong: string }).$numberLong)
            : NaN;
      if (!Number.isFinite(millis)) throw new Error('Seed plan date is malformed');
      return new Date(millis);
    }
    if (keys.some((key) => key.startsWith('$')))
      throw new Error(`Seed plan contains an unsupported extended JSON value: ${keys.join(',')}`);
    return Object.fromEntries(keys.map((key) => [key, revive(record[key])]));
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  throw new Error('Seed plan contains an unsupported value');
}

export function parsePlan(text: string): PlanEntry[] {
  const entries = JSON.parse(text) as unknown;
  if (!Array.isArray(entries)) throw new Error('Seed plan is not a list of entries');
  return entries.map((entry) => {
    const { collection, document } = (entry ?? {}) as Record<string, unknown>;
    if (typeof collection !== 'string' || !document || typeof document !== 'object')
      throw new Error('Seed plan entry is malformed');
    return { collection, document: revive(document) as PlanDocument };
  });
}

export const readPlan = (path: string) => parsePlan(readFileSync(path, 'utf8'));

/** Groups by collection, keeping each collection's documents in plan order. */
export function byCollection(entries: PlanEntry[]): Map<string, PlanDocument[]> {
  const grouped = new Map<string, PlanDocument[]>();
  for (const { collection, document } of entries) {
    const list = grouped.get(collection) ?? [];
    list.push(document);
    grouped.set(collection, list);
  }
  return grouped;
}

/** Where each collection's documents go: every collection the seed writes has a route. */
export type GraphWriter = (documents: PlanDocument[]) => Promise<void>;

export async function persistPlan(
  entries: PlanEntry[],
  routes: Record<string, GraphWriter>
): Promise<Record<string, number>> {
  const grouped = byCollection(entries);
  // Checked before anything is written, so an unknown collection cannot leave a
  // half-seeded environment behind.
  const unrouted = [...grouped.keys()].filter((name) => !routes[name]);
  if (unrouted.length)
    throw new Error(`No graph collection for seeded collection(s): ${unrouted.join(', ')}`);

  const summary: Record<string, number> = {};
  for (const [name, documents] of grouped) {
    await routes[name](documents);
    summary[name] = documents.length;
  }
  return summary;
}
