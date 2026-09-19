import { find as mingoFind, Query as MingoQuery, update as mingoUpdate } from 'mingo';
import {
  defineCollection,
  newObjectId,
  UniqueConstraintError,
  type CollectionDefinition,
  type Where,
} from './collection';
import { EntityExistsError } from '../db/graph/entity-store';

/**
 * A Mongoose model's interface over a graph collection.
 *
 * Server functions were written against Mongoose — `find(filter).sort().lean()`,
 * `updateOne(filter, { $set, $push })`, `doc.save()` — in some 350 places. This keeps
 * that interface and changes only where documents live: filters, updates and
 * projections keep MongoDB's semantics (evaluated by mingo, a MongoDB query engine),
 * and writes go through the collection layer, which gives every single-document write
 * compare-and-set and replaces unique indexes with reservations.
 *
 * Reads narrow on indexed fields (and the search index for `$text`) in the graph, then
 * apply the full filter, sort and paging in process. Every indexed field a caller filters
 * on is pushed down, so a query scoped by campaign reads that campaign's documents,
 * never the collection.
 *
 * What MongoDB offered beyond one document — multi-document transactions — is not
 * here. Callers that used them sequence their writes explicitly instead.
 */

type Plain = Record<string, unknown>;
export type FilterQuery = Plain;
export type UpdateQuery = Plain;
type SortSpec = string | Record<string, 1 | -1 | 'asc' | 'desc' | 'ascending' | 'descending'>;
type Projection = string | Record<string, 0 | 1 | boolean> | null | undefined;

/** ObjectIds become the 24-hex strings the graph stores; everything else is kept. */
export function toStored(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || value instanceof RegExp) return value;
  if (typeof (value as { toHexString?: unknown }).toHexString === 'function')
    return (value as { toHexString(): string }).toHexString();
  if (Array.isArray(value)) return value.map(toStored);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toStored(v)]));
}

const clone = <V>(value: V): V => structuredClone(value);
const isOperatorObject = (value: unknown): value is Plain =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  Object.keys(value).some((key) => key.startsWith('$'));
const isIndexValue = (value: unknown) =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  value instanceof Date;

function normalizeSort(sort: SortSpec | undefined): Record<string, 1 | -1> | undefined {
  if (!sort) return undefined;
  if (typeof sort === 'string') {
    const spec: Record<string, 1 | -1> = {};
    for (const part of sort.split(/\s+/).filter(Boolean))
      if (part.startsWith('-')) spec[part.slice(1)] = -1;
      else spec[part] = 1;
    return spec;
  }
  return Object.fromEntries(
    Object.entries(sort).map(([key, dir]) => [
      key,
      dir === -1 || dir === 'desc' || dir === 'descending' ? -1 : 1,
    ])
  );
}

function normalizeProjection(projection: Projection): Record<string, 0 | 1> | undefined {
  if (!projection) return undefined;
  if (typeof projection === 'string') {
    const spec: Record<string, 0 | 1> = {};
    for (const part of projection.split(/\s+/).filter(Boolean))
      if (part.startsWith('-')) spec[part.slice(1)] = 0;
      else spec[part.replace(/^\+/, '')] = 1;
    return Object.keys(spec).length ? spec : undefined;
  }
  const spec = Object.fromEntries(
    Object.entries(projection).map(([key, on]) => [key, on ? 1 : 0] as const)
  );
  return Object.keys(spec).length ? spec : undefined;
}

function project<V extends Plain>(documents: V[], projection: Projection): V[] {
  const spec = normalizeProjection(projection);
  if (!spec) return documents;
  return mingoFind(documents, {}, spec).all() as V[];
}

/** Mongoose treats an update without operators as `$set` of its fields. */
function normalizeUpdate(update: UpdateQuery): UpdateQuery {
  const stored = toStored(update) as UpdateQuery;
  if (Array.isArray(stored)) throw new Error('Pipeline updates are not supported');
  const hasOperators = Object.keys(stored).some((key) => key.startsWith('$'));
  return hasOperators ? stored : { $set: stored };
}

function applyUpdate<V extends Plain>(
  document: V,
  update: UpdateQuery,
  filter: FilterQuery,
  options: { arrayFilters?: Plain[]; inserting?: boolean }
): V {
  const next = clone(document);
  const { $setOnInsert, ...operators } = update;
  if (options.inserting && $setOnInsert)
    mingoUpdate(next as Plain, { $set: $setOnInsert as Plain });
  if (Object.keys(operators).length)
    mingoUpdate(
      next,
      operators as Parameters<typeof mingoUpdate>[1],
      options.arrayFilters,
      // The positional `$` operator refers to the element the filter matched.
      withoutText(filter) as Parameters<typeof mingoUpdate>[3]
    );
  return next;
}

function withoutText(filter: FilterQuery): FilterQuery {
  const { $text: _text, ...rest } = filter;
  return rest;
}

const matches = (document: Plain, filter: FilterQuery) =>
  new MingoQuery(withoutText(filter)).test(document);

/** The fields an upsert takes from its filter: top-level and dotted equalities. */
function seedFromFilter(filter: FilterQuery): Plain {
  const seed: Plain = {};
  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith('$')) {
      if (key === '$and')
        for (const clause of value as FilterQuery[]) Object.assign(seed, seedFromFilter(clause));
      continue;
    }
    if (isOperatorObject(value)) {
      if ('$eq' in value) seed[key] = value.$eq;
      continue;
    }
    seed[key] = value;
  }
  const document: Plain = {};
  mingoUpdate(document, { $set: seed });
  return document;
}

class NoMatch extends Error {}

/** How often an update looks for another match after its target changed under it. */
const RELOOK_ATTEMPTS = 12;

export interface WriteResult {
  acknowledged: true;
  matchedCount: number;
  modifiedCount: number;
  upsertedCount: number;
  upsertedId: string | null;
}

export interface DeleteResult {
  acknowledged: true;
  deletedCount: number;
}

export interface DocumentMethods<T> {
  save(): Promise<Doc<T>>;
  toObject(options?: unknown): T;
  toJSON(options?: unknown): T;
  get(path: string): unknown;
  set(path: string | Plain, value?: unknown): Doc<T>;
  markModified(path: string): void;
  deleteOne(): Promise<DeleteResult>;
  isNew: boolean;
  readonly id: string;
}
export type Doc<T> = T & DocumentMethods<T>;

/**
 * A chainable, awaitable query. `lean()` resolves plain documents; without it, documents
 * carry `save()`, `toObject()` and the other Mongoose document methods callers use.
 */
export class GraphQuery<Result, LeanResult = Result> implements PromiseLike<Result> {
  private state: {
    projection?: Projection;
    sort?: SortSpec;
    limit?: number;
    skip?: number;
    lean: boolean;
  };

  constructor(
    private readonly run: (state: GraphQuery<Result, LeanResult>['state']) => Promise<unknown>,
    projection?: Projection
  ) {
    this.state = { projection, lean: false };
  }

  select(projection: Projection): this {
    this.state.projection = projection;
    return this;
  }
  sort(sort: SortSpec): this {
    this.state.sort = sort;
    return this;
  }
  limit(limit: number): this {
    this.state.limit = limit;
    return this;
  }
  skip(skip: number): this {
    this.state.skip = skip;
    return this;
  }
  /** Transactions are gone; a session is accepted and ignored. */
  session(_session?: unknown): this {
    return this;
  }
  lean<R = LeanResult>(): GraphQuery<R, R> {
    this.state.lean = true;
    return this as unknown as GraphQuery<R, R>;
  }
  exec(): Promise<Result> {
    return this.run(this.state) as Promise<Result>;
  }
  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): Promise<A | B> {
    return this.exec().then(onFulfilled, onRejected);
  }
  catch<B = never>(onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return this.exec().catch(onRejected);
  }
  /** Iterates the results; the documents are read up front. */
  cursor(): AsyncIterable<Result extends Array<infer E> ? E : Result> {
    const results = this.exec();
    return {
      async *[Symbol.asyncIterator]() {
        const all = await results;
        for (const item of (Array.isArray(all) ? all : [all]) as never[]) yield item;
      },
    };
  }
}

export interface GraphModelDefinition<T extends { _id: string }> extends CollectionDefinition<T> {
  /** The Mongoose model name, kept for error messages and logs. */
  modelName?: string;
}

interface QueryOptions {
  upsert?: boolean;
  new?: boolean;
  returnDocument?: 'before' | 'after';
  returnOriginal?: boolean;
  sort?: SortSpec;
  projection?: Projection;
  fields?: Projection;
  arrayFilters?: Plain[];
  lean?: boolean;
  session?: unknown;
  ordered?: boolean;
  [option: string]: unknown;
}

export type BulkOperation =
  | { insertOne: { document: Plain } }
  | {
      updateOne: {
        filter: FilterQuery;
        update: UpdateQuery;
        upsert?: boolean;
        arrayFilters?: Plain[];
      };
    }
  | {
      updateMany: {
        filter: FilterQuery;
        update: UpdateQuery;
        upsert?: boolean;
        arrayFilters?: Plain[];
      };
    }
  | { replaceOne: { filter: FilterQuery; replacement: Plain; upsert?: boolean } }
  | { deleteOne: { filter: FilterQuery } }
  | { deleteMany: { filter: FilterQuery } };

export function defineGraphModel<T extends { _id: string }>(definition: GraphModelDefinition<T>) {
  const collection = defineCollection<T>(definition);
  const indexed = new Set(Object.keys(definition.index));
  const modelName = definition.modelName ?? definition.kind;

  const parse = (value: unknown): T => definition.schema.parse(value);

  /** Reads the documents that could match: narrowed in the graph, filtered here. */
  async function matching(rawFilter: FilterQuery = {}): Promise<T[]> {
    const filter = toStored(rawFilter) as FilterQuery;
    const id = filter._id;
    let candidates: T[];
    if (typeof id === 'string') {
      const one = await collection.get(id);
      candidates = one ? [one] : [];
    } else if (isOperatorObject(id) && Array.isArray(id.$in) && id.$in.every(isIndexValue)) {
      candidates = await collection.getMany(id.$in.map(String));
    } else {
      const where: Plain = {};
      for (const [key, value] of Object.entries(filter)) {
        if (!indexed.has(key)) continue;
        if (isIndexValue(value)) where[key] = value;
        else if (
          isOperatorObject(value) &&
          Object.keys(value).length === 1 &&
          Array.isArray(value.$in) &&
          value.$in.length > 0 &&
          value.$in.every(isIndexValue)
        )
          where[key] = { within: value.$in };
      }
      const text = (filter.$text as { $search?: string } | undefined)?.$search;
      candidates = await collection.findAll({ where: where as Where<T>, search: text });
    }
    // Natural order: ObjectIds lead with their creation second, as MongoDB's did.
    return candidates
      .filter((document) => matches(document, filter))
      .sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
  }

  function order(documents: T[], sort: SortSpec | undefined): T[] {
    const spec = normalizeSort(sort);
    return spec ? (mingoFind(documents, {}).sort(spec).all() as T[]) : documents;
  }

  function page<V>(documents: V[], skip?: number, limit?: number): V[] {
    const start = skip ?? 0;
    return limit ? documents.slice(start, start + limit) : documents.slice(start);
  }

  function hydrate(stored: T, isNew = false): Doc<T> {
    const document = clone(stored) as Doc<T>;
    let original: T | null = isNew ? null : clone(stored);
    const define = (name: string, value: unknown) =>
      Object.defineProperty(document, name, { value, enumerable: false, writable: true });
    const plain = () => {
      const copy: Plain = {};
      for (const key of Object.keys(document)) copy[key] = (document as unknown as Plain)[key];
      return clone(toStored(copy)) as T;
    };
    define('isNew', isNew);
    Object.defineProperty(document, 'id', {
      get: () => document._id,
      enumerable: false,
    });
    define('toObject', () => plain());
    define('toJSON', () => plain());
    define('get', (path: string) =>
      path.split('.').reduce<unknown>((value, key) => (value as Plain | undefined)?.[key], document)
    );
    define('set', (path: string | Plain, value?: unknown) => {
      if (typeof path === 'string')
        mingoUpdate(document as unknown as Plain, { $set: { [path]: value } });
      else Object.assign(document, path);
      return document;
    });
    define('markModified', () => {});
    define('deleteOne', async () => ({
      acknowledged: true,
      deletedCount: (await collection.remove(document._id)) ? 1 : 0,
    }));
    define('save', async () => {
      const current = plain();
      let saved: T;
      if (!original) {
        saved = await collection.insert(parse({ ...current, _id: current._id ?? newObjectId() }));
      } else {
        // Like Mongoose, write only what this document changed, onto the stored latest.
        const before = original;
        const changed = Object.keys({ ...before, ...current }).filter(
          (key) =>
            JSON.stringify((before as Plain)[key]) !== JSON.stringify((current as Plain)[key])
        );
        const updated = await collection.update(current._id, (latest) => {
          const next: Plain = { ...latest };
          for (const key of changed)
            if ((current as Plain)[key] === undefined) delete next[key];
            else next[key] = (current as Plain)[key];
          return parse(next);
        });
        if (!updated) throw new Error(`No ${modelName} found for id ${current._id} to save`);
        saved = updated;
      }
      original = clone(saved);
      Object.assign(document, clone(saved));
      document.isNew = false;
      return document;
    });
    return document;
  }

  /** Applies an update to one document by id, re-checking the filter on every attempt. */
  async function updateById(
    id: string,
    filter: FilterQuery,
    update: UpdateQuery,
    arrayFilters?: Plain[]
  ): Promise<{ before: T; after: T; modified: boolean } | null> {
    let before: T | null = null;
    let modified = false;
    try {
      const after = await collection.update(id, (current) => {
        if (!matches(current, filter)) throw new NoMatch();
        before = current;
        const next = parse(applyUpdate(current, update, filter, { arrayFilters }));
        modified = JSON.stringify(next) !== JSON.stringify(current);
        return next;
      });
      if (!after || !before) return null;
      return { before, after, modified };
    } catch (error) {
      if (error instanceof NoMatch) return null;
      throw error;
    }
  }

  async function upsert(filter: FilterQuery, update: UpdateQuery, arrayFilters?: Plain[]) {
    const seeded = seedFromFilter(filter);
    const document = parse({
      ...applyUpdate(seeded, update, filter, { arrayFilters, inserting: true }),
      _id: (seeded._id as string | undefined) ?? newObjectId(),
    });
    return collection.insert(document);
  }

  interface OneResult {
    before: T | null;
    after: T | null;
    matched: boolean;
    modified: boolean;
    upsertedId: string | null;
  }

  async function updateFirst(
    rawFilter: FilterQuery,
    rawUpdate: UpdateQuery,
    options: QueryOptions = {}
  ): Promise<OneResult> {
    const filter = toStored(rawFilter) as FilterQuery;
    const update = normalizeUpdate(rawUpdate);
    for (let attempt = 0; attempt < RELOOK_ATTEMPTS; attempt++) {
      const [target] = order(await matching(filter), options.sort);
      if (target) {
        const result = await updateById(target._id, filter, update, options.arrayFilters);
        // Changed under us so it no longer matches: look again, as MongoDB would.
        if (!result) continue;
        return { ...result, matched: true, upsertedId: null };
      }
      if (!options.upsert)
        return { before: null, after: null, matched: false, modified: false, upsertedId: null };
      try {
        const created = await upsert(filter, update, options.arrayFilters);
        return {
          before: null,
          after: created,
          matched: false,
          modified: false,
          upsertedId: created._id,
        };
      } catch (error) {
        // A concurrent upsert won; update the document it created instead.
        if (!(error instanceof EntityExistsError) && !(error instanceof UniqueConstraintError))
          throw error;
        if (attempt === RELOOK_ATTEMPTS - 1) throw error;
      }
    }
    return { before: null, after: null, matched: false, modified: false, upsertedId: null };
  }

  const writeResult = (matched: number, modified: number, upsertedId: string | null) =>
    ({
      acknowledged: true,
      matchedCount: matched,
      modifiedCount: modified,
      upsertedCount: upsertedId ? 1 : 0,
      upsertedId,
    }) satisfies WriteResult;

  const wrap = (documents: T[], state: { lean: boolean; projection?: Projection }) => {
    const projected = project(documents, state.projection);
    return state.lean || state.projection
      ? projected.map((document) => clone(document))
      : projected.map((document) => hydrate(document));
  };

  async function createOne(input: Plain): Promise<Doc<T>> {
    const stored = toStored(input) as Plain;
    const created = await collection.insert(parse({ ...stored, _id: stored._id ?? newObjectId() }));
    return hydrate(created);
  }

  async function createDocuments(input: Plain | Plain[]): Promise<Doc<T> | Doc<T>[]> {
    return Array.isArray(input) ? statics.insertMany(input) : createOne(input);
  }

  const statics = {
    modelName,
    collection: { name: definition.name },
    graphCollection: collection,

    find(filter: FilterQuery = {}, projection?: Projection, options: QueryOptions = {}) {
      const query = new GraphQuery<Doc<T>[], T[]>(async (state) => {
        const found = order(await matching(filter), state.sort ?? options.sort);
        return wrap(
          page(
            found,
            state.skip ?? (options.skip as number | undefined),
            state.limit ?? (options.limit as number | undefined)
          ),
          state
        );
      }, projection);
      if (options.lean) query.lean();
      return query;
    },

    findOne(filter: FilterQuery = {}, projection?: Projection, options: QueryOptions = {}) {
      const query = new GraphQuery<Doc<T> | null, T | null>(async (state) => {
        const [first] = order(await matching(filter), state.sort ?? options.sort);
        return first ? wrap([first], state)[0] : null;
      }, projection);
      if (options.lean) query.lean();
      return query;
    },

    findById(id: unknown, projection?: Projection, options: QueryOptions = {}) {
      const key = toStored(id);
      if (typeof key !== 'string')
        return new GraphQuery<Doc<T> | null, T | null>(async () => null, projection);
      return statics.findOne({ _id: key }, projection, options);
    },

    exists(filter: FilterQuery) {
      return new GraphQuery<{ _id: string } | null>(async () => {
        const [first] = await matching(filter);
        return first ? { _id: first._id } : null;
      });
    },

    countDocuments(filter: FilterQuery = {}) {
      return new GraphQuery<number>(async () => (await matching(filter)).length);
    },

    create: createDocuments as {
      (input: Plain): Promise<Doc<T>>;
      (input: Plain[]): Promise<Doc<T>[]>;
    },

    async insertMany(inputs: Plain[], options: QueryOptions = {}): Promise<Doc<T>[]> {
      const created: Doc<T>[] = [];
      let firstError: unknown;
      for (const input of inputs) {
        try {
          created.push(await createOne(input));
        } catch (error) {
          if (options.ordered !== false) throw error;
          firstError ??= error;
        }
      }
      if (firstError) throw firstError;
      return created;
    },

    updateOne(filter: FilterQuery, update: UpdateQuery, options: QueryOptions = {}) {
      return new GraphQuery<WriteResult>(async () => {
        const result = await updateFirst(filter, update, options);
        return writeResult(result.matched ? 1 : 0, result.modified ? 1 : 0, result.upsertedId);
      });
    },

    updateMany(filter: FilterQuery, update: UpdateQuery, options: QueryOptions = {}) {
      return new GraphQuery<WriteResult>(async () => {
        const stored = toStored(filter) as FilterQuery;
        const normalized = normalizeUpdate(update);
        let matched = 0;
        let modified = 0;
        for (const document of await matching(stored)) {
          const result = await updateById(document._id, stored, normalized, options.arrayFilters);
          if (!result) continue;
          matched++;
          if (result.modified) modified++;
        }
        if (matched === 0 && options.upsert) {
          const created = await upsert(stored, normalized, options.arrayFilters);
          return writeResult(0, 0, created._id);
        }
        return writeResult(matched, modified, null);
      });
    },

    findOneAndUpdate(filter: FilterQuery, update: UpdateQuery, options: QueryOptions = {}) {
      const query = new GraphQuery<Doc<T> | null, T | null>(async (state) => {
        const result = await updateFirst(filter, update, options);
        const returnAfter =
          options.new === true ||
          options.returnDocument === 'after' ||
          options.returnOriginal === false;
        const document = returnAfter ? result.after : result.before;
        return document ? wrap([document], state)[0] : null;
      }, options.projection ?? options.fields);
      if (options.lean) query.lean();
      return query;
    },

    findByIdAndUpdate(id: unknown, update: UpdateQuery, options: QueryOptions = {}) {
      return statics.findOneAndUpdate({ _id: toStored(id) }, update, options);
    },

    deleteOne(filter: FilterQuery = {}) {
      return new GraphQuery<DeleteResult>(async () => {
        const [first] = await matching(filter);
        const deleted = first ? await collection.remove(first._id) : false;
        return { acknowledged: true, deletedCount: deleted ? 1 : 0 };
      });
    },

    deleteMany(filter: FilterQuery = {}) {
      return new GraphQuery<DeleteResult>(async () => {
        let deletedCount = 0;
        for (const document of await matching(filter))
          if (await collection.remove(document._id)) deletedCount++;
        return { acknowledged: true, deletedCount };
      });
    },

    findOneAndDelete(filter: FilterQuery = {}) {
      return new GraphQuery<Doc<T> | null, T | null>(async (state) => {
        const [first] = await matching(filter);
        if (!first || !(await collection.remove(first._id))) return null;
        return wrap([first], state)[0];
      });
    },

    /** Each operation on its own, in order; there is no cross-document atomicity. */
    async bulkWrite(operations: BulkOperation[], options: QueryOptions = {}) {
      const totals = { insertedCount: 0, matchedCount: 0, modifiedCount: 0, deletedCount: 0 };
      let upsertedCount = 0;
      let firstError: unknown;
      for (const operation of operations) {
        try {
          if ('insertOne' in operation) {
            await statics.create(operation.insertOne.document);
            totals.insertedCount++;
          } else if ('updateOne' in operation || 'updateMany' in operation) {
            const spec = 'updateOne' in operation ? operation.updateOne : operation.updateMany;
            const run = 'updateOne' in operation ? statics.updateOne : statics.updateMany;
            const result = await run(spec.filter, spec.update, {
              upsert: spec.upsert,
              arrayFilters: spec.arrayFilters,
            });
            totals.matchedCount += result.matchedCount;
            totals.modifiedCount += result.modifiedCount;
            upsertedCount += result.upsertedCount;
          } else if ('replaceOne' in operation) {
            const { filter, replacement, upsert: allowUpsert } = operation.replaceOne;
            const [target] = await matching(filter);
            if (target) {
              await collection.update(target._id, () =>
                parse({ ...(toStored(replacement) as Plain), _id: target._id })
              );
              totals.matchedCount++;
              totals.modifiedCount++;
            } else if (allowUpsert) {
              await statics.create(replacement);
              upsertedCount++;
            }
          } else if ('deleteOne' in operation) {
            totals.deletedCount += (
              await statics.deleteOne(operation.deleteOne.filter)
            ).deletedCount;
          } else if ('deleteMany' in operation) {
            totals.deletedCount += (
              await statics.deleteMany(operation.deleteMany.filter)
            ).deletedCount;
          }
        } catch (error) {
          if (options.ordered !== false) throw error;
          firstError ??= error;
        }
      }
      if (firstError) throw firstError;
      return { ok: 1, ...totals, upsertedCount };
    },
  };

  type ModelType = typeof statics & { new (document?: Plain): Doc<T> };
  const Model = function (this: unknown, document: Plain = {}) {
    const stored = toStored(document) as Plain;
    return hydrate(parse({ ...stored, _id: stored._id ?? newObjectId() }), true);
  } as unknown as ModelType;
  Object.assign(Model, statics);
  return Model;
}

export type GraphModel<T extends { _id: string }> = ReturnType<typeof defineGraphModel<T>>;
