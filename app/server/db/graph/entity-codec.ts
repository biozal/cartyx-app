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
  /** Text made searchable through the mixed index. */
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

/** Parse a stored document, applying the codec's upgrade when it predates the current version. */
export function decodeDocument<T>(codec: EntityCodec<T>, raw: string, version: number): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw, (_key, value) =>
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value)
        ? new Date(value)
        : value
    );
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
  return JSON.stringify(result.data);
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

export function scopeKey(scope: EntityScope): string {
  return scope.type === 'global' ? 'global' : `${scope.type}:${scope.id}`;
}
