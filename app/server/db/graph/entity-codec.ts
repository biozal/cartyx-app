import { z } from 'zod';
import type { EntityScope } from './identity';

/** Generic indexed slots. Each domain codec maps its filterable fields onto them. */
export const INDEX_SLOTS = [
  'ix_s1',
  'ix_s2',
  'ix_s3',
  'ix_s4',
  'ix_s5',
  'ix_s6',
  'ix_s7',
  'ix_s8',
  'ix_n1',
  'ix_n2',
  'ix_n3',
  'ix_n4',
  'ix_b1',
  'ix_b2',
  'ix_b3',
  'ix_b4',
  'ix_d1',
  'ix_d2',
] as const;
export type IndexSlot = (typeof INDEX_SLOTS)[number];
export type IndexValue = string | number | boolean | Date | null;

const slotKind = (slot: IndexSlot) => slot[3] as 's' | 'n' | 'b' | 'd';

export function assertSlotValue(slot: IndexSlot, value: IndexValue) {
  if (value === null) return;
  const kind = slotKind(slot);
  const ok =
    (kind === 's' && typeof value === 'string') ||
    (kind === 'n' && typeof value === 'number' && Number.isFinite(value)) ||
    (kind === 'b' && typeof value === 'boolean') ||
    (kind === 'd' && value instanceof Date && Number.isFinite(value.getTime()));
  if (!ok) throw new Error(`Index slot ${slot} cannot hold this value`);
}

export interface EntityCodec<T> {
  /** Vertex label and identity kind, e.g. `Location`. */
  kind: string;
  /** Bump with an `upgrade` whenever the stored document shape changes. */
  version: number;
  schema: z.ZodType<T>;
  /** Fields that may be filtered or ordered, mapped onto indexed slots. */
  index: Partial<Record<string, IndexSlot>>;
  /**
   * Text made searchable. It is tokenised into words and stored as a multi-valued
   * indexed property, which matches Mongo `$text` word semantics through ordinary
   * composite indexes. There is no prefix, substring, fuzzy or ranked search.
   */
  searchText?: (value: T) => string;
  upgrade?: (raw: unknown, fromVersion: number) => unknown;
}

export function defineEntity<T>(codec: EntityCodec<T>): EntityCodec<T> {
  if (!/^[A-Z][A-Za-z]{0,63}$/.test(codec.kind)) throw new Error('Invalid entity kind');
  if (codec.kind === 'GraphSchema') throw new Error('Reserved entity kind');
  const slots = Object.values(codec.index);
  if (new Set(slots).size !== slots.length) throw new Error('Duplicate index slot');
  for (const slot of slots)
    if (!slot || !INDEX_SLOTS.includes(slot)) throw new Error(`Unknown index slot ${slot}`);
  return codec;
}

/**
 * Dates are stored tagged, so that only a value written as a date is read back as one.
 * Recognising dates by their shape instead would turn text that happens to look like a
 * timestamp — a note whose whole content is one — into a Date on the way back.
 */
const DATE_TAG = '$cartyxDate';

function tagDates(value: unknown): unknown {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Cannot store an invalid date');
    return { [DATE_TAG]: value.toISOString() };
  }
  if (Array.isArray(value)) return value.map(tagDates);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    // A caller-supplied key equal to the tag would be read back as a date.
    if (entries.some(([key]) => key === DATE_TAG)) throw new Error(`${DATE_TAG} is a reserved key`);
    return Object.fromEntries(entries.map(([key, item]) => [key, tagDates(item)]));
  }
  return value;
}

function reviveDates(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === DATE_TAG) {
      const date = new Date((value as Record<string, unknown>)[DATE_TAG] as string);
      if (!Number.isFinite(date.getTime())) throw new Error('Corrupt stored date');
      return date;
    }
  }
  return value;
}

/** Parse a stored document, applying the codec's upgrade when it predates the current version. */
export function decodeDocument<T>(codec: EntityCodec<T>, raw: string, version: number): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, reviveDates);
  } catch {
    throw new Error(`Corrupt ${codec.kind} document`);
  }
  if (version > codec.version) throw new Error(`${codec.kind} document is newer than this code`);
  if (version < codec.version) {
    if (!codec.upgrade) throw new Error(`${codec.kind} document needs an upgrade path`);
    parsed = codec.upgrade(parsed, version);
  }
  const result = codec.schema.safeParse(parsed);
  if (!result.success) throw new Error(`Invalid ${codec.kind} document`);
  return result.data;
}

export function encodeDocument<T>(codec: EntityCodec<T>, value: T): string {
  const result = codec.schema.safeParse(value);
  if (!result.success) throw new Error(`Invalid ${codec.kind} value`);
  return JSON.stringify(tagDates(result.data));
}

/** Project the indexed fields of a validated value onto their slots. */
export function indexProjection<T>(codec: EntityCodec<T>, value: T): Record<string, IndexValue> {
  const projection: Record<string, IndexValue> = {};
  for (const [field, slot] of Object.entries(codec.index)) {
    if (!slot) continue;
    const raw = (value as Record<string, unknown>)[field] ?? null;
    const item = raw as IndexValue;
    assertSlotValue(slot, item);
    projection[slot] = item;
  }
  return projection;
}

export const MAX_SEARCH_WORDS = 512;
export const MAX_SEARCH_WORD_LENGTH = 64;

/** Lower-cased, de-duplicated word tokens. Both writes and queries use this. */
export function searchWords(text: string): string[] {
  const words = new Set<string>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    words.add(word.slice(0, MAX_SEARCH_WORD_LENGTH));
    if (words.size >= MAX_SEARCH_WORDS) break;
  }
  return [...words];
}

export function scopeKey(scope: EntityScope): string {
  return scope.type === 'global' ? 'global' : `${scope.type}:${scope.id}`;
}
