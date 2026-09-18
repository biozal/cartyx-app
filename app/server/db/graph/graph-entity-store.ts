import { randomBytes } from 'node:crypto';
import gremlin from 'gremlin';
import { GraphRequestError } from './transport';
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
  MAX_TRAVERSAL_DEPTH,
  StaleRevisionError,
  type EntityRef,
  type EntityStore,
  type Filter,
  type ListQuery,
  type Stored,
} from './entity-store';
import type { EntityScope } from './identity';

const __ = gremlin.process.statics;
const { cardinality, order, P } = gremlin.process;

export interface EntityGraphClient {
  execute(traversal: gremlin.process.GraphTraversal, signal?: AbortSignal): Promise<unknown[]>;
}

const source = () => new gremlin.structure.Graph().traversal();

/** Property names are fixed by the schema migration; only slots and labels vary. */
const DOC = 'doc';
const DOC_VERSION = 'docVersion';
const REVISION = 'revision';
const CREATED_AT = 'createdAt';
const UPDATED_AT = 'updatedAt';
const SEARCH_WORD = 'searchWord';
const POSITION = 'position';
// One declared label for every domain entity: the indexed `kind` property carries identity,
// so adding a domain kind needs no schema change.
const ENTITY_LABEL = 'Entity';

function parseScope(value: string): EntityScope {
  if (value === 'global') return { type: 'global' };
  const [type, id] = value.split(':');
  return { type: type as 'campaign' | 'user', id };
}

/** The driver returns GraphSON maps as JS Maps, not plain objects. */
function field(row: unknown, key: string): unknown {
  if (row instanceof Map) return row.get(key);
  return (row as Record<string, unknown>)[key];
}

function number(value: unknown): number {
  // g:Int64 arrives as a number or as a driver Long depending on magnitude.
  const parsed =
    typeof value === 'object' && value !== null ? Number(String(value)) : Number(value);
  return parsed;
}

function readRow<T>(codec: EntityCodec<T>, row: unknown): Stored<T> {
  const record = Object.fromEntries(
    [DOC, DOC_VERSION, REVISION, CREATED_AT, UPDATED_AT, 'scope', 'entityId'].map((key) => [
      key,
      field(row, key),
    ])
  ) as Record<string, unknown>;
  const document = record[DOC];
  const documentVersion = number(record[DOC_VERSION]);
  const revision = number(record[REVISION]);
  const entityId = String(record.entityId);
  const scope = String(record.scope);
  if (
    typeof document !== 'string' ||
    !Number.isInteger(documentVersion) ||
    !Number.isInteger(revision)
  )
    throw new Error(`Corrupt ${codec.kind} record`);
  return {
    ref: { kind: codec.kind, scope: parseScope(scope), id: entityId },
    revision,
    value: decodeDocument(codec, document, documentVersion),
    createdAt: new Date(record[CREATED_AT] as string | number | Date),
    updatedAt: new Date(record[UPDATED_AT] as string | number | Date),
  };
}

const projectRow = (traversal: gremlin.process.GraphTraversal) =>
  traversal
    .project('scope', 'entityId', DOC, DOC_VERSION, REVISION, CREATED_AT, UPDATED_AT)
    .by(__.values('scope'))
    .by(__.values('entityId'))
    .by(__.values(DOC))
    .by(__.values(DOC_VERSION))
    .by(__.values(REVISION))
    .by(__.values(CREATED_AT))
    .by(__.values(UPDATED_AT));

const identity = (kind: string, scope: EntityScope, id: string) =>
  source().V().has('scope', scopeKey(scope)).has('kind', kind).has('entityId', id);

const scoped = (kind: string, scope: EntityScope) =>
  source().V().has('scope', scopeKey(scope)).has('kind', kind);

function applyFilters<T>(
  traversal: gremlin.process.GraphTraversal,
  codec: EntityCodec<T>,
  query: Pick<ListQuery<T>, 'where' | 'search'>
) {
  for (const [field, filter] of Object.entries(query.where ?? {})) {
    const slot = codec.index[field];
    if (!slot) throw new Error(`${field} is not an indexed field of ${codec.kind}`);
    if (filter === undefined) continue;
    const value = filter as Filter;
    if (value && typeof value === 'object' && !(value instanceof Date) && 'within' in value)
      traversal = traversal.has(slot, P.within(...value.within.map(encodeIndexValue)));
    else traversal = traversal.has(slot, encodeIndexValue(value as IndexValue));
  }
  if (query.search) {
    if (!codec.searchText) throw new Error(`${codec.kind} has no searchable text`);
    // Word matching, like Mongo `$text`: every query word must be present. Each
    // has() is an indexed lookup on the multi-valued word property.
    for (const word of searchWords(query.search)) traversal = traversal.has(SEARCH_WORD, word);
  }
  return traversal;
}

const encodeIndexValue = (value: IndexValue) => (value instanceof Date ? value : value);

function writeProperties<T>(
  traversal: gremlin.process.GraphTraversal,
  codec: EntityCodec<T>,
  value: T,
  document: string,
  timestamp: Date
) {
  traversal = traversal
    .property(cardinality.single, DOC, document)
    .property(cardinality.single, DOC_VERSION, codec.version)
    .property(cardinality.single, UPDATED_AT, timestamp);
  for (const [slot, item] of Object.entries(indexProjection(codec, value)))
    // A null index value is stored as an absent property so `has` cannot match it.
    traversal = item === null ? traversal : traversal.property(cardinality.single, slot, item);
  if (codec.searchText) {
    // The word set is multi-valued, so the previous words are dropped in the same
    // traversal (one JanusGraph transaction) before the new ones are written.
    traversal = traversal.sideEffect(__.properties(SEARCH_WORD).drop());
    for (const word of searchWords(codec.searchText(value)))
      traversal = traversal.property(cardinality.set, SEARCH_WORD, word);
  }
  return traversal;
}

/**
 * JanusGraph-backed entity store. Every operation is a single bounded traversal built
 * from the step vocabulary the server policy allows; the application never sends
 * scripts, and per-user authorization stays in the repositories above this layer.
 */
export function createGraphEntityStore(client: EntityGraphClient): EntityStore {
  const rows = async <T>(codec: EntityCodec<T>, traversal: gremlin.process.GraphTraversal) =>
    (await client.execute(traversal)).map((row) => readRow(codec, row));

  const store: EntityStore = {
    async create(codec, scope, value, id) {
      const entityId = id ?? randomBytes(12).toString('hex');
      if (!/^[0-9a-f]{24}$/.test(entityId)) throw new Error('Expected a canonical entity id');
      const document = encodeDocument(codec, value);
      const ref: EntityRef = { kind: codec.kind, scope, id: entityId };
      const now = new Date();
      let create = __.addV(ENTITY_LABEL)
        .property(cardinality.single, 'scope', scopeKey(scope))
        .property(cardinality.single, 'kind', codec.kind)
        .property(cardinality.single, 'entityId', entityId)
        .property(cardinality.single, REVISION, 1)
        .property(cardinality.single, CREATED_AT, now);
      create = writeProperties(create, codec, value, document, now);
      // Create-or-report in one traversal: a concurrent create loses the unique index
      // and is reported, never silently merged into the existing entity.
      const outcome = await client.execute(
        identity(codec.kind, scope, entityId)
          .fold()
          .coalesce(__.unfold().constant('exists'), create.constant('created'))
      );
      if (outcome[0] === 'exists') throw new EntityExistsError(ref);
      const stored = await store.get(codec, scope, entityId);
      if (!stored) throw new EntityNotFoundError(ref);
      return stored;
    },

    async get(codec, scope, id) {
      const found = await rows(codec, projectRow(identity(codec.kind, scope, id).limit(2)));
      if (found.length > 1) throw new Error(`Duplicate ${codec.kind} identity`);
      return found[0] ?? null;
    },

    async getMany(codec, scope, ids) {
      if (!ids.length) return [];
      const found = await rows(
        codec,
        projectRow(
          scoped(codec.kind, scope)
            .has('entityId', P.within(...ids))
            .limit(ids.length + 1)
        )
      );
      const byId = new Map(found.map((item) => [item.ref.id, item]));
      return ids.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
    },

    async update(codec, scope, id, expectedRevision, next) {
      const ref: EntityRef = { kind: codec.kind, scope, id };
      const document = encodeDocument(codec, next);
      const now = new Date();
      const updated = await client.execute(
        writeProperties(
          identity(codec.kind, scope, id)
            .has(REVISION, expectedRevision)
            .property(cardinality.single, REVISION, expectedRevision + 1),
          codec,
          next,
          document,
          now
        ).count()
      );
      if (number(updated[0]) !== 1) {
        const current = await store.get(codec, scope, id);
        if (!current) throw new EntityNotFoundError(ref);
        throw new StaleRevisionError(ref);
      }
      const stored = await store.get(codec, scope, id);
      if (!stored) throw new EntityNotFoundError(ref);
      return stored;
    },

    async mutate(codec, scope, id, change, attempts = DEFAULT_MUTATE_ATTEMPTS) {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const current = await store.get(codec, scope, id);
        if (!current) throw new EntityNotFoundError({ kind: codec.kind, scope, id });
        try {
          return await store.update(codec, scope, id, current.revision, change(current.value));
        } catch (error) {
          // A lost revision lock is the same race as a stale revision: re-read and retry.
          const conflict =
            error instanceof StaleRevisionError ||
            (error instanceof GraphRequestError && error.code === 'conflict');
          if (!conflict || attempt === attempts - 1) throw error;
        }
      }
      throw new StaleRevisionError({ kind: codec.kind, scope, id });
    },

    async remove(codec, scope, id) {
      // Dropping a vertex removes its incident edges.
      // drop() emits nothing, so the marker is produced by the surviving traverser:
      // the removal happens in a side effect and the branch still reports it.
      const removed = await client.execute(
        identity(codec.kind, scope, id)
          .fold()
          .coalesce(__.unfold().sideEffect(__.drop()).constant('removed'), __.constant('absent'))
      );
      return removed[0] === 'removed';
    },

    async list(codec, scope, query) {
      assertQuery(query);
      let traversal = applyFilters(scoped(codec.kind, scope), codec, query);
      if (query.orderBy) {
        const slot = codec.index[query.orderBy.field];
        if (!slot) throw new Error(`${query.orderBy.field} is not an indexed field`);
        traversal = traversal
          .order()
          .by(slot, query.orderBy.direction === 'desc' ? order.desc : order.asc);
      }
      const offset = query.offset ?? 0;
      return rows(codec, projectRow(traversal.range(offset, offset + query.limit)));
    },

    async count(codec, scope, query = {}) {
      const counted = await client.execute(
        applyFilters(scoped(codec.kind, scope), codec, query).count()
      );
      return number(counted[0] ?? 0);
    },

    async setEdges(from, label, to) {
      assertEdgeLabel(label);
      const self = () =>
        source()
          .V()
          .has('scope', scopeKey(from.scope))
          .has('kind', from.kind)
          .has('entityId', from.id);
      const exists = await client.execute(self().limit(1).count());
      if (number(exists[0]) !== 1) throw new EntityNotFoundError(from);
      await client.execute(self().outE(label).drop());
      for (const [position, target] of to.entries()) {
        const linked = await client.execute(
          self()
            .as('from')
            .V()
            .has('scope', scopeKey(target.scope))
            .has('kind', target.kind)
            .has('entityId', target.id)
            .addE(label)
            .from_('from')
            .property(POSITION, position)
            .count()
        );
        if (number(linked[0]) !== 1) throw new EntityNotFoundError(target);
      }
    },

    async edges(ref, label, direction, limit) {
      assertEdgeLabel(label);
      const start = source()
        .V()
        .has('scope', scopeKey(ref.scope))
        .has('kind', ref.kind)
        .has('entityId', ref.id);
      const step = direction === 'out' ? start.outE(label) : start.inE(label);
      const other =
        direction === 'out'
          ? step.order().by(POSITION, order.asc).inV()
          : step.order().by(POSITION, order.asc).outV();
      return refs(await client.execute(projectRef(other.limit(limit))));
    },

    async traverse(start, label, direction, maxDepth, limit) {
      assertEdgeLabel(label);
      if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > MAX_TRAVERSAL_DEPTH)
        throw new Error(`maxDepth must be an integer from 1 to ${MAX_TRAVERSAL_DEPTH}`);
      const from = source()
        .V()
        .has('scope', scopeKey(start.scope))
        .has('kind', start.kind)
        .has('entityId', start.id);
      const walked = from
        .repeat(direction === 'out' ? __.out(label) : __.in_(label))
        .emit()
        .times(maxDepth)
        .simplePath()
        .dedup()
        .limit(limit);
      return refs(await client.execute(projectRef(walked)));
    },
  };

  return store;
}

const projectRef = (traversal: gremlin.process.GraphTraversal) =>
  traversal
    .project('scope', 'kind', 'entityId')
    .by(__.values('scope'))
    .by(__.values('kind'))
    .by(__.values('entityId'));

const refs = (result: unknown[]): EntityRef[] =>
  result.map((row) => ({
    kind: String(field(row, 'kind')),
    scope: parseScope(String(field(row, 'scope'))),
    id: String(field(row, 'entityId')),
  }));
