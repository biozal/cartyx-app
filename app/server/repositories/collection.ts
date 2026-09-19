import { z } from 'zod';
import { defineEntity, type IndexSlot } from '../db/graph/entity-codec';
import {
  EntityNotFoundError,
  MAX_LIST_LIMIT,
  type Filter,
  type ListQuery,
} from '../db/graph/entity-store';
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
  /** Bump with an `upgrade` whenever the stored shape changes. */
  version?: number;
  upgrade?: (raw: unknown, fromVersion: number) => unknown;
}

export type Where<T> = Partial<Record<keyof T & string, Filter>>;

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

    /** Creation fails if the id is taken, which is what makes a derived id a guarantee. */
    async insert(document: T): Promise<T> {
      const value = codec.schema.parse(document);
      const created = await (await entityStore()).create(codec, GLOBAL, value, value._id);
      return created.value;
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
      return (await entityStore()).remove(codec, GLOBAL, id);
    },

    /** Removes every match and reports how many were removed. */
    async removeWhere(where: Where<T>): Promise<number> {
      let removed = 0;
      for (const document of await collection.findAll({ where }))
        if (await collection.remove(document._id)) removed++;
      return removed;
    },
  };
  return collection;
}

export type Collection<T extends { _id: string }> = ReturnType<typeof defineCollection<T>>;
