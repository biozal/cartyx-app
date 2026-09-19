// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('~/server/repositories/entity-store', () => import('../functions/entityStoreDouble'));
import { resetEntityStore } from '../functions/entityStoreDouble';
import { defineCollection, objectIdString } from '~/server/repositories/collection';
import { EntityExistsError } from '~/server/db/graph/entity-store';

const hex = (n: number) => n.toString(16).padStart(24, '0');

const things = defineCollection({
  name: 'things',
  kind: 'CollectionThing',
  schema: z.object({
    _id: objectIdString,
    campaignId: objectIdString,
    name: z.string(),
    rank: z.number().default(0),
    tags: z.array(z.string()).default([]),
    createdAt: z.date(),
  }),
  index: { campaignId: 'ix_s1', name: 'ix_s2', rank: 'ix_n1' },
  searchText: (doc) => doc.name,
});

const doc = (n: number, campaign = 1, extra: Record<string, unknown> = {}) => ({
  _id: hex(n),
  campaignId: hex(1000 + campaign),
  name: `thing ${n}`,
  rank: n,
  tags: [],
  createdAt: new Date(0),
  ...extra,
});

beforeEach(() => resetEntityStore());

describe('collection', () => {
  it('stores a MongoDB-shaped document under its own _id and reads it back', async () => {
    await things.insert(doc(1));
    expect(await things.get(hex(1))).toEqual(doc(1));
    expect(await things.get(hex(2))).toBeNull();
    // An id that could never be valid is simply not found, not an error.
    expect(await things.get('not-an-id')).toBeNull();
  });

  it('applies schema defaults the way Mongoose did', async () => {
    const { rank: _rank, tags: _tags, ...partial } = doc(1);
    await things.insert(partial as never);
    expect(await things.get(hex(1))).toMatchObject({ rank: 0, tags: [] });
  });

  it('refuses a second document with the same _id', async () => {
    await things.insert(doc(1));
    await expect(things.insert(doc(1, 2))).rejects.toBeInstanceOf(EntityExistsError);
  });

  it('finds by indexed fields, orders, pages, counts and searches', async () => {
    for (let n = 1; n <= 5; n++) await things.insert(doc(n, n % 2));
    const inCampaign = await things.find({
      where: { campaignId: hex(1001) },
      orderBy: { field: 'rank', direction: 'desc' },
    });
    expect(inCampaign.map((d) => d.rank)).toEqual([5, 3, 1]);
    expect(await things.count({ campaignId: hex(1000) })).toBe(2);
    expect((await things.find({ search: 'thing 4' })).map((d) => d._id)).toEqual([hex(4)]);
    expect((await things.findOne({ where: { name: 'thing 2' } }))?._id).toBe(hex(2));
  });

  it('pages through every match, past the store page size', async () => {
    for (let n = 1; n <= 510; n++) await things.insert(doc(n));
    const all = await things.findAll({ where: { campaignId: hex(1001) } });
    expect(all).toHaveLength(510);
    expect(new Set(all.map((d) => d._id)).size).toBe(510);
  });

  it('gets many by id, ignoring unknown and malformed ids', async () => {
    await things.insertMany([doc(1), doc(2)]);
    const found = await things.getMany([hex(2), hex(9), 'bad', hex(1), hex(2)]);
    expect(found.map((d) => d._id).sort()).toEqual([hex(1), hex(2)]);
  });

  it('updates with compare-and-set, and cannot move a document to another _id', async () => {
    await things.insert(doc(1));
    const updated = await things.update(hex(1), (current) => ({ ...current, name: 'renamed' }));
    expect(updated?.name).toBe('renamed');
    expect(await things.count({ name: 'renamed' })).toBe(1);
    expect(await things.update(hex(9), (current) => current)).toBeNull();
    await expect(things.update(hex(1), (current) => ({ ...current, _id: hex(2) }))).rejects.toThrow(
      /cannot change/
    );
  });

  it('loses no update when writers race', async () => {
    await things.insert(doc(1));
    await Promise.all(
      Array.from({ length: 8 }, (_v, i) =>
        things.update(hex(1), (current) => ({ ...current, tags: [...current.tags, `t${i}`] }))
      )
    );
    expect((await things.get(hex(1)))?.tags).toHaveLength(8);
  });

  it('removes by id and by filter', async () => {
    await things.insertMany([doc(1), doc(2), doc(3, 2)]);
    expect(await things.remove(hex(1))).toBe(true);
    expect(await things.remove(hex(1))).toBe(false);
    expect(await things.removeWhere({ campaignId: hex(1001) })).toBe(1);
    expect((await things.findAll()).map((d) => d._id)).toEqual([hex(3)]);
  });
});
