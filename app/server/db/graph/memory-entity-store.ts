import { randomBytes } from 'node:crypto';
import {
  decodeDocument,
  encodeDocument,
  indexProjection,
  scopeKey,
  searchWords,
  type EntityCodec,
  type IndexValue,
} from './entity-codec';
import {
  assertEdgeLabel,
  assertQuery,
  DEFAULT_MUTATE_ATTEMPTS,
  EntityExistsError,
  EntityNotFoundError,
  StaleRevisionError,
  type EntityRef,
  type EntityStore,
  type Filter,
  type ListQuery,
  type Stored,
} from './entity-store';
import type { EntityScope } from './identity';

interface Row {
  kind: string;
  scope: string;
  entityId: string;
  document: string;
  documentVersion: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  index: Record<string, IndexValue>;
  searchWords: string[];
}

interface Edge {
  from: string;
  to: string;
  label: string;
  position: number;
}

const key = (scope: string, kind: string, entityId: string) => `${scope}|${kind}|${entityId}`;

const matches = (actual: IndexValue | undefined, filter: Filter) => {
  const equal = (left: IndexValue | undefined, right: IndexValue) =>
    left instanceof Date && right instanceof Date
      ? left.getTime() === right.getTime()
      : left === right;
  if (filter && typeof filter === 'object' && 'within' in filter)
    return filter.within.some((candidate) => equal(actual, candidate));
  return equal(actual, filter);
};

const compare = (left: IndexValue | undefined, right: IndexValue | undefined) => {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  const a = left instanceof Date ? left.getTime() : left;
  const b = right instanceof Date ? right.getTime() : right;
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

/**
 * Reference implementation of the entity store for unit tests. It must satisfy the
 * same contract as the JanusGraph store; when the two disagree, the contract decides.
 */
export function createMemoryEntityStore(): EntityStore {
  const rows = new Map<string, Row>();
  const edges: Edge[] = [];

  const read = <T>(codec: EntityCodec<T>, row: Row): Stored<T> => ({
    ref: { kind: codec.kind, scope: parseScope(row.scope), id: row.entityId },
    revision: row.revision,
    value: decodeDocument(codec, row.document, row.documentVersion),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  const parseScope = (value: string): EntityScope => {
    if (value === 'global') return { type: 'global' };
    const [type, id] = value.split(':');
    return { type: type as 'campaign' | 'user', id };
  };

  const select = <T>(
    codec: EntityCodec<T>,
    scope: EntityScope,
    query: Pick<ListQuery<T>, 'where' | 'search'>
  ) => {
    const scoped = scopeKey(scope);
    return [...rows.values()].filter((row) => {
      if (row.scope !== scoped || row.kind !== codec.kind) return false;
      for (const [field, filter] of Object.entries(query.where ?? {})) {
        const slot = codec.index[field];
        if (!slot) throw new Error(`${field} is not an indexed field of ${codec.kind}`);
        if (filter === undefined) continue;
        if (!matches(row.index[slot], filter as Filter)) return false;
      }
      if (query.search) {
        if (!codec.searchText) throw new Error(`${codec.kind} has no searchable text`);
        // Word matching, like Mongo `$text`: every query word must be present.
        if (!searchWords(query.search).every((word) => row.searchWords.includes(word)))
          return false;
      }
      return true;
    });
  };

  const store: EntityStore = {
    async create(codec, scope, value, id) {
      const entityId = id ?? randomBytes(12).toString('hex');
      if (!/^[0-9a-f]{24}$/.test(entityId)) throw new Error('Expected a canonical entity id');
      const document = encodeDocument(codec, value);
      const ref: EntityRef = { kind: codec.kind, scope, id: entityId };
      const rowKey = key(scopeKey(scope), codec.kind, entityId);
      if (rows.has(rowKey)) throw new EntityExistsError(ref);
      const now = new Date();
      rows.set(rowKey, {
        kind: codec.kind,
        scope: scopeKey(scope),
        entityId,
        document,
        documentVersion: codec.version,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        index: indexProjection(codec, value),
        searchWords: codec.searchText ? searchWords(codec.searchText(value)) : [],
      });
      return read(codec, rows.get(rowKey)!);
    },

    async get(codec, scope, id) {
      const row = rows.get(key(scopeKey(scope), codec.kind, id));
      return row ? read(codec, row) : null;
    },

    async getMany(codec, scope, ids) {
      const found = [];
      for (const id of ids) {
        const row = rows.get(key(scopeKey(scope), codec.kind, id));
        if (row) found.push(read(codec, row));
      }
      return found;
    },

    async update(codec, scope, id, expectedRevision, next) {
      const ref: EntityRef = { kind: codec.kind, scope, id };
      const row = rows.get(key(scopeKey(scope), codec.kind, id));
      if (!row) throw new EntityNotFoundError(ref);
      const document = encodeDocument(codec, next);
      if (row.revision !== expectedRevision) throw new StaleRevisionError(ref);
      row.document = document;
      row.documentVersion = codec.version;
      row.revision += 1;
      row.updatedAt = new Date();
      row.index = indexProjection(codec, next);
      row.searchWords = codec.searchText ? searchWords(codec.searchText(next)) : [];
      return read(codec, row);
    },

    async mutate(codec, scope, id, change, attempts = DEFAULT_MUTATE_ATTEMPTS) {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const current = await store.get(codec, scope, id);
        if (!current) throw new EntityNotFoundError({ kind: codec.kind, scope, id });
        try {
          return await store.update(codec, scope, id, current.revision, change(current.value));
        } catch (error) {
          if (!(error instanceof StaleRevisionError) || attempt === attempts - 1) throw error;
        }
      }
      throw new StaleRevisionError({ kind: codec.kind, scope, id });
    },

    async remove(codec, scope, id) {
      const rowKey = key(scopeKey(scope), codec.kind, id);
      if (!rows.delete(rowKey)) return false;
      for (let index = edges.length - 1; index >= 0; index--)
        if (edges[index].from === rowKey || edges[index].to === rowKey) edges.splice(index, 1);
      return true;
    },

    async list(codec, scope, query) {
      assertQuery(query);
      const selected = select(codec, scope, query);
      const byId = (left: Row, right: Row) =>
        left.entityId < right.entityId ? -1 : left.entityId > right.entityId ? 1 : 0;
      if (query.orderBy) {
        const slot = codec.index[query.orderBy.field];
        if (!slot) throw new Error(`${query.orderBy.field} is not an indexed field`);
        const direction = query.orderBy.direction === 'desc' ? -1 : 1;
        // A missing value sorts first ascending and last descending, as in MongoDB.
        selected.sort(
          (left, right) =>
            direction * compare(left.index[slot], right.index[slot]) || byId(left, right)
        );
      } else {
        selected.sort(byId);
      }
      return selected
        .slice(query.offset ?? 0, (query.offset ?? 0) + query.limit)
        .map((row) => read(codec, row));
    },

    async count(codec, scope, query = {}) {
      return select(codec, scope, query).length;
    },

    async setEdges(from, label, to) {
      assertEdgeLabel(label);
      const fromKey = key(scopeKey(from.scope), from.kind, from.id);
      if (!rows.has(fromKey)) throw new EntityNotFoundError(from);
      for (let index = edges.length - 1; index >= 0; index--)
        if (edges[index].from === fromKey && edges[index].label === label) edges.splice(index, 1);
      for (const [position, target] of to.entries()) {
        const toKey = key(scopeKey(target.scope), target.kind, target.id);
        if (!rows.has(toKey)) throw new EntityNotFoundError(target);
        edges.push({ from: fromKey, to: toKey, label, position });
      }
    },

    async edges(ref, label, direction, limit) {
      assertEdgeLabel(label);
      const self = key(scopeKey(ref.scope), ref.kind, ref.id);
      return edges
        .filter(
          (edge) => edge.label === label && (direction === 'out' ? edge.from : edge.to) === self
        )
        .sort((left, right) => left.position - right.position)
        .slice(0, limit)
        .map((edge) => refOf(direction === 'out' ? edge.to : edge.from));
    },

    async traverse(start, label, direction, maxDepth, limit) {
      assertEdgeLabel(label);
      const seen = new Set<string>([key(scopeKey(start.scope), start.kind, start.id)]);
      const found: EntityRef[] = [];
      let frontier = [key(scopeKey(start.scope), start.kind, start.id)];
      for (let depth = 0; depth < maxDepth && frontier.length && found.length < limit; depth++) {
        const next: string[] = [];
        for (const node of frontier)
          for (const edge of edges) {
            if (edge.label !== label) continue;
            if ((direction === 'out' ? edge.from : edge.to) !== node) continue;
            const other = direction === 'out' ? edge.to : edge.from;
            if (seen.has(other)) continue;
            seen.add(other);
            next.push(other);
            if (found.length < limit) found.push(refOf(other));
          }
        frontier = next;
      }
      return found;
    },
  };

  const refOf = (rowKey: string): EntityRef => {
    const row = rows.get(rowKey)!;
    return { kind: row.kind, scope: parseScope(row.scope), id: row.entityId };
  };

  return store;
}
