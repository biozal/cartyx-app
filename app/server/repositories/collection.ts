import { createHash } from 'node:crypto';
import { z } from 'zod';
import { defineEntity, type IndexSlot } from '../db/graph/entity-codec';
import {
  EntityExistsError,
  EntityNotFoundError,
  MAX_LIST_LIMIT,
  StaleRevisionError,
  type EntityStore,
  type Filter,
  type ListQuery,
} from '../db/graph/entity-store';
import { GraphRequestError } from '../db/graph/transport';
import type { EntityScope } from '../db/graph/identity';
import { entityStore } from './entity-store';

/**
 * A MongoDB collection's documents, kept in the graph.
 *
 * Each document keeps the shape it had in MongoDB — the same field names, `_id`, and
 * references — with ObjectIds as 24-character hex strings. That is deliberate: server
 * functions keep reading the fields they always read, and the seeder, fixtures and E2E
 * specs can write a collection by name, so moving a subsystem changes where its
 * documents live rather than what they are.
 *
 * Every document lives in the global scope with its owning campaign as an indexed field,
 * because many functions fetch by id alone and then check the campaign; an id alone
 * must be enough to find a document.
 */
export const objectIdString = z.string().regex(/^[0-9a-f]{24}$/, 'Expected a 24-hex id');

const GLOBAL: EntityScope = { type: 'global' };

export interface CollectionDefinition<T extends { _id: string }> {
  /** The MongoDB collection name, which the seeder and fixtures address it by. */
  name: string;
  /** The entity kind: a PascalCase name, stable once data exists. */
  kind: string;
  schema: z.ZodType<T>;
  /** Fields that may be filtered or ordered on, mapped to indexed slots. */
  index: Partial<Record<keyof T & string, IndexSlot>>;
  searchText?: (document: T) => string;
  /** Replacements for MongoDB unique indexes, by name. */
  unique?: Record<string, UniqueKey<T>>;
  /** Bump with an `upgrade` whenever the stored shape changes. */
  version?: number;
  upgrade?: (raw: unknown, fromVersion: number) => unknown;
}

export type Where<T> = Partial<Record<keyof T & string, Filter>>;

/** The parts that must be unique together, or null when the document takes no part. */
export type UniqueKey<T> = (document: T) => Array<string | number | boolean | null> | null;

/**
 * A MongoDB unique index's duplicate-key error, by another name. It carries code 11000
 * so code written against MongoDB's error keeps recognising it.
 */
export class UniqueConstraintError extends Error {
  readonly code = 11000;
  constructor(
    readonly collection: string,
    readonly key: string
  ) {
    super(`E11000 duplicate key: ${collection}.${key}`);
    this.name = 'UniqueConstraintError';
  }
}

/**
 * One entity per claimed unique value, whose id is derived from the collection, key
 * name and value. Creating an entity whose id is taken fails atomically, which is the
 * whole guarantee a MongoDB unique index gave.
 */
const reservationSchema = z.object({
  _id: objectIdString,
  collection: z.string(),
  key: z.string(),
  owner: objectIdString,
});
type Reservation = z.infer<typeof reservationSchema>;
const reservationCodec = defineEntity<Reservation>({
  kind: 'UniqueKey',
  version: 1,
  schema: reservationSchema,
  index: { owner: 'ix_s1' },
});

const reservationId = (collection: string, key: string, parts: unknown[]) =>
  createHash('sha256')
    .update(JSON.stringify([collection, key, parts]))
    .digest('hex')
    .slice(0, 24);

const isConflict = (error: unknown) =>
  error instanceof StaleRevisionError ||
  (error instanceof GraphRequestError && error.code === 'conflict');

export interface FindOptions<T> {
  where?: Where<T>;
  search?: string;
  orderBy?: { field: keyof T & string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

export function defineCollection<T extends { _id: string }>(definition: CollectionDefinition<T>) {
  const codec = defineEntity<T>({
    kind: definition.kind,
    version: definition.version ?? 1,
    schema: definition.schema,
    index: definition.index as Record<string, IndexSlot>,
    searchText: definition.searchText,
    upgrade: definition.upgrade,
  });

  const query = (options: FindOptions<T>, limit: number, offset: number): ListQuery<T> => ({
    where: options.where,
    search: options.search,
    orderBy: options.orderBy,
    limit,
    offset,
  });

  const uniqueKeys = Object.entries(definition.unique ?? {});
  const claims = (document: T) =>
    uniqueKeys.flatMap(([key, parts]) => {
      const value = parts(document);
      return value ? [{ key, id: reservationId(definition.name, key, value) }] : [];
    });

  /**
   * Claims each key for the document, or releases what it claimed and throws.
   *
   * A reservation whose owner no longer holds the key was left by a process that died
   * between claiming and writing, and is reclaimed rather than blocking the value for
   * good — but only once it is older than a grace period. A younger one may belong to
   * an insert still in flight whose document is not written yet; taking it over would
   * let two documents hold the same key, which is the one thing this must prevent.
   */
  async function claim(
    store: EntityStore,
    document: T,
    wanted: { key: string; id: string }[]
  ): Promise<string[]> {
    const taken: string[] = [];
    try {
      for (const { key, id } of wanted) {
        const reservation = { _id: id, collection: definition.name, key, owner: document._id };
        const outcome = await reserve(store, reservation);
        if (outcome === 'already-ours') continue;
        if (outcome === 'taken') throw new UniqueConstraintError(definition.name, key);
        taken.push(id);
      }
      return taken;
    } catch (error) {
      await release(store, document._id, taken);
      throw error;
    }
  }

  /**
   * Creates one reservation. JanusGraph reports a create that lost a race for the id as
   * a conflict that may or may not have committed, so every uncertain outcome is
   * settled by reading back who holds the reservation.
   */
  async function reserve(
    store: EntityStore,
    reservation: Reservation
  ): Promise<'created' | 'already-ours' | 'taken'> {
    const { _id: id, owner } = reservation;
    for (let attempt = 0; attempt < DEFAULT_ATTEMPTS; attempt++) {
      let existed = false;
      try {
        await store.create(reservationCodec, GLOBAL, reservation, id);
        return 'created';
      } catch (error) {
        existed = error instanceof EntityExistsError;
        if (!existed && !isConflict(error)) throw error;
      }
      const held = await store.get(reservationCodec, GLOBAL, id);
      // Ours after a conflict means our own create committed after all. Ours before we
      // tried belongs to a document already stored under this id: not ours to release.
      if (held?.value.owner === owner) return existed ? 'already-ours' : 'created';
      if (!held) continue; // Released between the attempt and the read: try again.
      const holder = await store.get(codec, GLOBAL, held.value.owner);
      const stillHeld = holder && claims(holder.value).some((c) => c.id === id);
      const abandoned = !stillHeld && Date.now() - held.updatedAt.getTime() > RESERVATION_GRACE_MS;
      if (!abandoned) return 'taken';
      try {
        await store.update(reservationCodec, GLOBAL, id, held.revision, reservation);
        return 'created';
      } catch (error) {
        if (!isConflict(error)) throw error;
      }
    }
    throw new StaleRevisionError({ kind: reservationCodec.kind, scope: GLOBAL, id });
  }

  async function release(store: EntityStore, owner: string, ids: string[]) {
    for (const id of ids) {
      const held = await store.get(reservationCodec, GLOBAL, id);
      if (held?.value.owner === owner) await store.remove(reservationCodec, GLOBAL, id);
    }
  }

  const collection = {
    name: definition.name,
    codec,

    /** The document as stored, or null. */
    async get(id: string): Promise<T | null> {
      if (!objectIdString.safeParse(id).success) return null;
      return (await (await entityStore()).get(codec, GLOBAL, id))?.value ?? null;
    },

    async getMany(ids: string[]): Promise<T[]> {
      const valid = [...new Set(ids)].filter((id) => objectIdString.safeParse(id).success);
      const found: T[] = [];
      const store = await entityStore();
      for (let i = 0; i < valid.length; i += MAX_LIST_LIMIT)
        for (const item of await store.getMany(codec, GLOBAL, valid.slice(i, i + MAX_LIST_LIMIT)))
          found.push(item.value);
      return found;
    },

    /** One page. Every filter must be on an indexed field. */
    async find(options: FindOptions<T> = {}): Promise<T[]> {
      const store = await entityStore();
      const rows = await store.list(
        codec,
        GLOBAL,
        query(
          options,
          Math.min(options.limit ?? MAX_LIST_LIMIT, MAX_LIST_LIMIT),
          options.offset ?? 0
        )
      );
      return rows.map((row) => row.value);
    },

    /** Every match, paging through the store's bounded pages. */
    async findAll(options: Omit<FindOptions<T>, 'limit' | 'offset'> = {}): Promise<T[]> {
      const store = await entityStore();
      const all: T[] = [];
      for (let offset = 0; ; offset += MAX_LIST_LIMIT) {
        const page = await store.list(codec, GLOBAL, query(options, MAX_LIST_LIMIT, offset));
        all.push(...page.map((row) => row.value));
        if (page.length < MAX_LIST_LIMIT) return all;
      }
    },

    async findOne(options: Omit<FindOptions<T>, 'limit'> = {}): Promise<T | null> {
      return (await collection.find({ ...options, limit: 1 }))[0] ?? null;
    },

    async count(where: Where<T> = {}, search?: string): Promise<number> {
      return (await entityStore()).count(codec, GLOBAL, { where, search });
    },

    /**
     * Creation fails if the id is taken, which is what makes a derived id a guarantee,
     * or if a unique key is already claimed by another document.
     */
    async insert(document: T): Promise<T> {
      const value = codec.schema.parse(document);
      const store = await entityStore();
      const claimed = await claim(store, value, claims(value));
      try {
        return (await store.create(codec, GLOBAL, value, value._id)).value;
      } catch (error) {
        await release(store, value._id, claimed);
        throw error;
      }
    },

    async insertMany(documents: T[]): Promise<T[]> {
      const created: T[] = [];
      for (const document of documents) created.push(await collection.insert(document));
      return created;
    },

    /**
     * Read-modify-write with compare-and-set: a concurrent writer causes a re-read and a
     * retry, never a lost update. Returns null when the document does not exist.
     */
    async update(id: string, change: (current: T) => T): Promise<T | null> {
      if (!objectIdString.safeParse(id).success) return null;
      if (uniqueKeys.length) return updateClaimingKeys(id, change);
      try {
        const stored = await (
          await entityStore()
        ).mutate(codec, GLOBAL, id, (current) => {
          const next = change(current);
          if (next._id !== id) throw new Error(`${definition.kind} _id cannot change`);
          return next;
        });
        return stored.value;
      } catch (error) {
        if (error instanceof EntityNotFoundError) return null;
        throw error;
      }
    },

    async remove(id: string): Promise<boolean> {
      if (!objectIdString.safeParse(id).success) return false;
      const store = await entityStore();
      const current = uniqueKeys.length ? await store.get(codec, GLOBAL, id) : null;
      const removed = await store.remove(codec, GLOBAL, id);
      if (current)
        await release(
          store,
          id,
          claims(current.value).map((c) => c.id)
        );
      return removed;
    },

    /** Removes every match and reports how many were removed. */
    async removeWhere(where: Where<T>): Promise<number> {
      let removed = 0;
      for (const document of await collection.findAll({ where }))
        if (await collection.remove(document._id)) removed++;
      return removed;
    },
  };
  /**
   * An update that may change a unique key claims the new value before writing and
   * releases the old one only after the write lands. A lost race releases what it
   * claimed and re-applies the change to the newer document.
   */
  async function updateClaimingKeys(id: string, change: (current: T) => T): Promise<T | null> {
    const store = await entityStore();
    for (let attempt = 0; attempt < DEFAULT_ATTEMPTS; attempt++) {
      const current = await store.get(codec, GLOBAL, id);
      if (!current) return null;
      const next = codec.schema.parse(change(current.value));
      if (next._id !== id) throw new Error(`${definition.kind} _id cannot change`);
      const before = claims(current.value).map((c) => c.id);
      const after = claims(next);
      const added = await claim(
        store,
        next,
        after.filter((c) => !before.includes(c.id))
      );
      try {
        const stored = await store.update(codec, GLOBAL, id, current.revision, next);
        const kept = new Set(after.map((c) => c.id));
        await release(
          store,
          id,
          before.filter((c) => !kept.has(c))
        );
        return stored.value;
      } catch (error) {
        await release(store, id, added);
        if (!isConflict(error)) throw error;
        // Losers that retry at once collide again; spread them out.
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * Math.min(10 * 2 ** attempt, 250))
        );
      }
    }
    throw new StaleRevisionError({ kind: definition.kind, scope: GLOBAL, id });
  }

  return collection;
}

const DEFAULT_ATTEMPTS = 12;
/** How long a claim may wait for its document before it counts as abandoned. */
const RESERVATION_GRACE_MS = 60_000;

export type Collection<T extends { _id: string }> = ReturnType<typeof defineCollection<T>>;
