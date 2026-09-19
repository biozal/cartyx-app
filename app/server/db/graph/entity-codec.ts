import { stemmer as stem } from 'stemmer';
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
   * Text made searchable. It is reduced to terms the way MongoDB's text index does —
   * stop words dropped, words stemmed — and stored as a multi-valued indexed property,
   * so a search matches any of its terms through an ordinary composite index. There is
   * no prefix, substring, fuzzy or ranked search, as there was none in the app either.
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

/**
 * English stop words, which MongoDB's text search ignores. Its list is derived from the
 * Snowball project's, which this is. With any-word matching they matter: without them
 * a search for "the dragon" would match nearly every document through "the".
 */
const STOP_WORDS = new Set(
  (
    'i me my myself we our ours ourselves you your yours yourself yourselves he him his ' +
    'himself she her hers herself it its itself they them their theirs themselves what ' +
    'which who whom this that these those am is are was were be been being have has had ' +
    'having do does did doing would should could ought a an the and but if or because as ' +
    'until while of at by for with about against between into through during before after ' +
    'above below to from up down in out on off over under again further then once here ' +
    'there when where why how all any both each few more most other some such no nor not ' +
    'only own same so than too very s t can will just don shouldn now d ll m o re ve y ' +
    'ain aren couldn didn doesn hadn hasn haven isn ma mightn mustn needn shan wasn ' +
    "weren won wouldn i'm you're he's she's it's we're they're i've you've we've " +
    "they've i'd you'd he'd she'd we'd they'd i'll you'll he'll she'll we'll they'll " +
    "isn't aren't wasn't weren't hasn't haven't hadn't doesn't don't didn't won't " +
    "wouldn't shan't shouldn't can't cannot couldn't mustn't let's that's who's what's " +
    "here's there's when's where's why's how's"
  ).split(' ')
);

/**
 * Search terms, as MongoDB's text index derives them: case- and diacritic-insensitive
 * words, English stop words dropped, each reduced to its stem so "goblins" finds
 * "goblin". Writes and queries both use this, so they always agree. Stemming is Porter's
 * algorithm where MongoDB uses Snowball's refinement of it; they agree on plurals and
 * verb forms, which is what people search with, and differ only on rare words.
 */
export function searchWords(text: string): string[] {
  const words = new Set<string>();
  const folded = text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
  for (const word of folded.split(/[^\p{L}\p{N}']+/u)) {
    const bare = word.replace(/^'+|'+$/g, '');
    if (!bare || STOP_WORDS.has(bare)) continue;
    const term = stem(bare.replace(/'/g, '')).slice(0, MAX_SEARCH_WORD_LENGTH);
    if (term) words.add(term);
    if (words.size >= MAX_SEARCH_WORDS) break;
  }
  return [...words];
}

export function scopeKey(scope: EntityScope): string {
  return scope.type === 'global' ? 'global' : `${scope.type}:${scope.id}`;
}
