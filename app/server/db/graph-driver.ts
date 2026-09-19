/**
 * The MongoDB driver's collection interface over a graph model.
 *
 * Code written against the driver — E2E specs, development fixtures, and the realtime
 * and audio-worker services, which each took a driver collection by injection — keeps
 * its calls: insertOne, find().sort().toArray(), updateOne, findOneAndUpdate,
 * bulkWrite… answered in the driver's result shapes through the graph model the app
 * itself uses, so every writer obeys the same schema and unique keys.
 *
 * Returned documents carry their `_id` as an ObjectId, as the driver's did.
 */
import type { GraphModel } from '../repositories/graph-model';
import { newObjectId } from '../repositories/collection';

type Plain = Record<string, unknown>;

/** Just enough of bson's ObjectId: specs create, compare and print ids. */
export class ObjectId {
  private readonly hex: string;
  constructor(id?: string | { toHexString(): string }) {
    const text = id === undefined ? newObjectId() : typeof id === 'string' ? id : id.toHexString();
    if (!/^[0-9a-fA-F]{24}$/.test(text)) throw new Error(`Not an ObjectId: ${text}`);
    this.hex = text.toLowerCase();
  }
  static isValid(id: unknown): boolean {
    return typeof id === 'string' ? /^[0-9a-fA-F]{24}$/.test(id) : id instanceof ObjectId;
  }
  toHexString(): string {
    return this.hex;
  }
  toString(): string {
    return this.hex;
  }
  toJSON(): string {
    return this.hex;
  }
  equals(other: unknown): boolean {
    if (other === null || other === undefined) return false;
    const text =
      typeof other === 'string'
        ? other
        : typeof (other as { toHexString?: unknown }).toHexString === 'function'
          ? (other as { toHexString(): string }).toHexString()
          : String(other);
    return text.toLowerCase() === this.hex;
  }
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `ObjectId("${this.hex}")`;
  }
}

/**
 * While collections still on MongoDB exist, ids handed to specs are the driver's own
 * ObjectIds, so a spec can use one in a MongoDB filter; bson does not serialize any other
 * class as an id. Once the driver is gone, the local class stands in.
 */
const DriverObjectId = await import('mongodb').then(
  (driver) => driver.ObjectId,
  () => null
);
const toObjectId = (hex: string): ObjectId =>
  (DriverObjectId ? new DriverObjectId(hex) : new ObjectId(hex)) as ObjectId;

const withObjectId = <D>(document: D): D =>
  document && typeof (document as Plain)._id === 'string'
    ? ({ ...document, _id: toObjectId((document as Plain)._id as string) } as D)
    : document;

interface FindOptions {
  projection?: Plain;
  sort?: Plain;
  limit?: number;
  skip?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any graph model's document type
type Model = GraphModel<any>;

/** A driver cursor: chain, then toArray() or iterate. */
function cursor(model: Model, filter: Plain, options: FindOptions = {}) {
  const state = { ...options };
  const run = async () => {
    let query = model.find(filter, state.projection as never);
    if (state.sort) query = query.sort(state.sort as never);
    if (state.skip) query = query.skip(state.skip);
    if (state.limit) query = query.limit(state.limit);
    return ((await query.lean()) as Plain[]).map(withObjectId);
  };
  const self = {
    sort(sort: Plain) {
      state.sort = sort;
      return self;
    },
    limit(limit: number) {
      state.limit = limit;
      return self;
    },
    skip(skip: number) {
      state.skip = skip;
      return self;
    },
    project(projection: Plain) {
      state.projection = projection;
      return self;
    },
    toArray: run,
    async *[Symbol.asyncIterator]() {
      for (const document of await run()) yield document;
    },
    stream() {
      return self[Symbol.asyncIterator]();
    },
  };
  return self;
}

export function graphCollection(model: Model) {
  const upsertedId = (id: string | null) => (id ? toObjectId(id) : null);
  return {
    async insertOne(document: Plain) {
      const created = (await model.create(document)) as { _id: string };
      return { acknowledged: true, insertedId: toObjectId(created._id) };
    },
    async insertMany(documents: Plain[], options: { ordered?: boolean } = {}) {
      const created = (await model.insertMany(documents, options)) as { _id: string }[];
      return {
        acknowledged: true,
        insertedCount: created.length,
        insertedIds: Object.fromEntries(created.map((d, i) => [i, toObjectId(d._id)])),
      };
    },
    find(filter: Plain = {}, options: FindOptions = {}) {
      return cursor(model, filter, options);
    },
    async findOne(filter: Plain = {}, options: FindOptions = {}) {
      const [first] = await cursor(model, filter, { ...options, limit: 1 }).toArray();
      return first ?? null;
    },
    async countDocuments(filter: Plain = {}) {
      return model.countDocuments(filter);
    },
    async updateOne(filter: Plain, update: Plain, options: Plain = {}) {
      const result = await model.updateOne(filter, update, options);
      return { ...result, upsertedId: upsertedId(result.upsertedId) };
    },
    async updateMany(filter: Plain, update: Plain, options: Plain = {}) {
      const result = await model.updateMany(filter, update, options);
      return { ...result, upsertedId: upsertedId(result.upsertedId) };
    },
    async findOneAndUpdate(
      filter: Plain,
      update: Plain,
      options: { returnDocument?: 'before' | 'after'; upsert?: boolean } = {}
    ) {
      return withObjectId(await model.findOneAndUpdate(filter, update, options).lean());
    },
    async deleteOne(filter: Plain = {}) {
      return model.deleteOne(filter);
    },
    async deleteMany(filter: Plain = {}) {
      return model.deleteMany(filter);
    },
    async bulkWrite(operations: Parameters<Model['bulkWrite']>[0], options: Plain = {}) {
      return model.bulkWrite(operations, options);
    },
  };
}
