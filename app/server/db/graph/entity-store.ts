import type { EntityCodec, IndexValue } from './entity-codec';
import type { EntityScope } from './identity';

export interface EntityRef {
  kind: string;
  scope: EntityScope;
  id: string;
}

export interface Stored<T> {
  ref: EntityRef;
  revision: number;
  value: T;
  createdAt: Date;
  updatedAt: Date;
}

/** The expected revision did not match: re-read and decide, never blind-retry a write. */
export class StaleRevisionError extends Error {
  constructor(readonly ref: EntityRef) {
    super(`Stale revision for ${ref.kind}`);
    this.name = 'StaleRevisionError';
  }
}

export class EntityNotFoundError extends Error {
  constructor(readonly ref: EntityRef) {
    super(`No ${ref.kind} for the requested identity`);
    this.name = 'EntityNotFoundError';
  }
}

export class EntityExistsError extends Error {
  constructor(readonly ref: EntityRef) {
    super(`A ${ref.kind} already exists for this identity`);
    this.name = 'EntityExistsError';
  }
}

export type Filter = IndexValue | { within: IndexValue[] };

export interface ListQuery<T> {
  where?: Partial<Record<keyof T & string, Filter>>;
  /** Word match through the mixed index; requires the codec to define `searchText`. */
  search?: string;
  orderBy?: { field: keyof T & string; direction: 'asc' | 'desc' };
  limit: number;
  offset?: number;
}

export interface EntityStore {
  create<T>(codec: EntityCodec<T>, scope: EntityScope, value: T, id?: string): Promise<Stored<T>>;
  get<T>(codec: EntityCodec<T>, scope: EntityScope, id: string): Promise<Stored<T> | null>;
  getMany<T>(codec: EntityCodec<T>, scope: EntityScope, ids: string[]): Promise<Stored<T>[]>;
  update<T>(
    codec: EntityCodec<T>,
    scope: EntityScope,
    id: string,
    expectedRevision: number,
    next: T
  ): Promise<Stored<T>>;
  /** Read-modify-write with bounded compare-and-set retries. */
  mutate<T>(
    codec: EntityCodec<T>,
    scope: EntityScope,
    id: string,
    change: (current: T) => T,
    attempts?: number
  ): Promise<Stored<T>>;
  remove<T>(codec: EntityCodec<T>, scope: EntityScope, id: string): Promise<boolean>;
  list<T>(codec: EntityCodec<T>, scope: EntityScope, query: ListQuery<T>): Promise<Stored<T>[]>;
  count<T>(
    codec: EntityCodec<T>,
    scope: EntityScope,
    query?: Pick<ListQuery<T>, 'where' | 'search'>
  ): Promise<number>;
  /** Replace all outgoing edges of this label, preserving the given order. */
  setEdges(from: EntityRef, label: string, to: EntityRef[]): Promise<void>;
  edges(
    ref: EntityRef,
    label: string,
    direction: 'out' | 'in',
    limit: number
  ): Promise<EntityRef[]>;
  /** Bounded, cycle-safe traversal of one edge label. */
  traverse(
    start: EntityRef,
    label: string,
    direction: 'out' | 'in',
    maxDepth: number,
    limit: number
  ): Promise<EntityRef[]>;
}

export const MAX_LIST_LIMIT = 500;
export const MAX_TRAVERSAL_DEPTH = 8;
export const DEFAULT_MUTATE_ATTEMPTS = 3;

export function assertQuery<T>(query: ListQuery<T>) {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIST_LIMIT)
    throw new Error(`limit must be an integer from 1 to ${MAX_LIST_LIMIT}`);
  if (query.offset !== undefined && (!Number.isInteger(query.offset) || query.offset < 0))
    throw new Error('offset must be a non-negative integer');
  if (query.search !== undefined && !query.search.trim())
    throw new Error('search must not be empty');
}

export function assertEdgeLabel(label: string) {
  if (!/^[A-Z][A-Z_]{0,63}$/.test(label)) throw new Error('Invalid edge label');
}
