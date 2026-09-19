import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { defineEntity } from '~/server/db/graph/entity-codec';
import {
  EntityExistsError,
  StaleRevisionError,
  type EntityRef,
  type EntityStore,
} from '~/server/db/graph/entity-store';
import type { EntityScope } from '~/server/db/graph/identity';

export const contractThing = defineEntity({
  kind: 'ContractThing',
  version: 1,
  schema: z.object({
    name: z.string(),
    rank: z.number().int(),
    isPublic: z.boolean(),
    tags: z.array(z.string()),
    notedAt: z.date().nullable(),
  }),
  index: { name: 'ix_s1', rank: 'ix_n1', isPublic: 'ix_b1', notedAt: 'ix_d1' },
  searchText: (value) => `${value.name} ${value.tags.join(' ')}`,
});
type Thing = z.infer<typeof contractThing.schema>;

export const contractLink = defineEntity({
  kind: 'ContractNode',
  version: 1,
  schema: z.object({ name: z.string() }),
  index: { name: 'ix_s1' },
});

const id = () => randomBytes(12).toString('hex');
const thing = (overrides: Partial<Thing> = {}): Thing => ({
  name: 'Prancing Pony',
  rank: 1,
  isPublic: true,
  tags: ['tavern'],
  notedAt: null,
  ...overrides,
});

/**
 * One behavioural definition for every entity store. The in-memory store used by unit
 * tests and the JanusGraph store used at runtime must both satisfy it, so a passing
 * unit test means the same thing as a passing real-store test.
 */
export async function entityStoreContract(
  makeStore: () => Promise<{ store: EntityStore; cleanup: (refs: EntityRef[]) => Promise<void> }>
) {
  const { store, cleanup } = await makeStore();
  const scope: EntityScope = { type: 'campaign', id: id() };
  const otherScope: EntityScope = { type: 'campaign', id: id() };
  const created: EntityRef[] = [];
  let cleanupFailure: unknown;
  const track = <T>(record: { ref: EntityRef } & T) => {
    created.push(record.ref);
    return record;
  };

  try {
    // Create and read back, preserving nested arrays and Dates.
    const noted = new Date('2026-02-03T04:05:06.007Z');
    const first = track(
      await store.create(contractThing, scope, thing({ tags: ['tavern', 'inn'], notedAt: noted }))
    );
    assert.equal(first.revision, 1);
    assert.match(first.ref.id, /^[0-9a-f]{24}$/);
    const read = await store.get(contractThing, scope, first.ref.id);
    assert.deepEqual(read?.value, thing({ tags: ['tavern', 'inn'], notedAt: noted }));
    assert.deepEqual(read?.createdAt, first.createdAt);

    // A caller-supplied identity is honoured once and cannot be created twice.
    const chosen = id();
    track(await store.create(contractThing, scope, thing({ name: 'Chosen' }), chosen));
    await assert.rejects(
      store.create(contractThing, scope, thing({ name: 'Duplicate' }), chosen),
      EntityExistsError
    );
    assert.equal((await store.get(contractThing, scope, chosen))?.value.name, 'Chosen');

    // Missing entities read as null, never as an empty object.
    assert.equal(await store.get(contractThing, scope, id()), null);
    // The same id in another scope is a different entity.
    assert.equal(await store.get(contractThing, otherScope, first.ref.id), null);

    // getMany preserves the requested order and skips what is absent.
    const many = await store.getMany(contractThing, scope, [chosen, id(), first.ref.id]);
    assert.deepEqual(
      many.map((item) => item.ref.id),
      [chosen, first.ref.id]
    );

    // Updates advance the revision; a stale expectation is refused.
    const updated = await store.update(contractThing, scope, first.ref.id, first.revision, {
      ...first.value,
      name: 'The Inn',
    });
    assert.equal(updated.revision, 2);
    assert.equal(updated.value.name, 'The Inn');
    assert.ok(updated.updatedAt.getTime() >= first.updatedAt.getTime());
    assert.deepEqual(updated.createdAt, first.createdAt);
    await assert.rejects(
      store.update(contractThing, scope, first.ref.id, first.revision, first.value),
      StaleRevisionError
    );
    assert.equal((await store.get(contractThing, scope, first.ref.id))?.value.name, 'The Inn');

    // Concurrent read-modify-write must not lose appends.
    const shared = track(await store.create(contractThing, scope, thing({ tags: [] })));
    await Promise.all(
      Array.from({ length: 10 }, (_item, index) =>
        store.mutate(
          contractThing,
          scope,
          shared.ref.id,
          (current) => ({ ...current, tags: [...current.tags, `t${index}`] }),
          20
        )
      )
    );
    const merged = await store.get(contractThing, scope, shared.ref.id);
    // Counted, not de-duplicated: a retry that re-applied an already-committed change
    // would append a second copy, which a set would hide. The revision below pins it too.
    assert.equal(merged?.value.tags.length, 10, 'every append lands exactly once');
    assert.equal(new Set(merged?.value.tags).size, 10, 'no append is lost');
    assert.equal(merged?.revision, 11);

    // Filtering, ordering and paging use the indexed projection.
    const listScope: EntityScope = { type: 'campaign', id: id() };
    for (const [index, name] of ['alpha', 'bravo', 'charlie', 'delta'].entries())
      track(
        await store.create(
          contractThing,
          listScope,
          thing({ name, rank: index, isPublic: index % 2 === 0, tags: [name] })
        )
      );
    const publicOnly = await store.list(contractThing, listScope, {
      where: { isPublic: true },
      orderBy: { field: 'rank', direction: 'asc' },
      limit: 10,
    });
    assert.deepEqual(
      publicOnly.map((item) => item.value.name),
      ['alpha', 'charlie']
    );
    const withinRanks = await store.list(contractThing, listScope, {
      where: { rank: { within: [1, 3] } },
      orderBy: { field: 'rank', direction: 'desc' },
      limit: 10,
    });
    assert.deepEqual(
      withinRanks.map((item) => item.value.name),
      ['delta', 'bravo']
    );
    const page = await store.list(contractThing, listScope, {
      orderBy: { field: 'rank', direction: 'asc' },
      limit: 2,
      offset: 2,
    });
    assert.deepEqual(
      page.map((item) => item.value.name),
      ['charlie', 'delta']
    );
    // Ordering on a field some documents lack keeps them, first when ascending. Graph
    // ordering by a missing property drops the element instead, which would make a
    // listing sorted on a nullable field silently lose documents.
    const datedScope: EntityScope = { type: 'campaign', id: id() };
    for (const [name, notedAt] of [
      ['undated', null],
      ['later', new Date('2026-02-01T00:00:00.000Z')],
      ['earlier', new Date('2026-01-01T00:00:00.000Z')],
    ] as const)
      track(await store.create(contractThing, datedScope, thing({ name, notedAt })));
    assert.deepEqual(
      (
        await store.list(contractThing, datedScope, {
          orderBy: { field: 'notedAt', direction: 'asc' },
          limit: 10,
        })
      ).map((item) => item.value.name),
      ['undated', 'earlier', 'later']
    );
    assert.deepEqual(
      (
        await store.list(contractThing, datedScope, {
          orderBy: { field: 'notedAt', direction: 'desc' },
          limit: 10,
        })
      ).map((item) => item.value.name),
      ['later', 'earlier', 'undated']
    );

    // Clearing an indexed field removes it from the index: a filter on the value it
    // used to have must stop matching, and ordering must treat it as missing.
    const [dated] = await store.list(contractThing, datedScope, {
      where: { name: 'earlier' },
      limit: 1,
    });
    await store.update(contractThing, datedScope, dated!.ref.id, dated!.revision, {
      ...dated!.value,
      notedAt: null,
    });
    assert.deepEqual(
      await store.list(contractThing, datedScope, {
        where: { notedAt: new Date('2026-01-01T00:00:00.000Z') },
        limit: 10,
      }),
      [],
      'a cleared index value no longer matches'
    );
    assert.equal(
      (
        await store.list(contractThing, datedScope, {
          orderBy: { field: 'notedAt', direction: 'desc' },
          limit: 10,
        })
      ).at(0)?.value.name,
      'later'
    );

    // Unordered listings are still deterministic, so paging with offsets neither skips
    // nor repeats a document — equal sort keys are broken by id.
    const pagedScope: EntityScope = { type: 'campaign', id: id() };
    const paged = [];
    for (let n = 0; n < 7; n++)
      paged.push(track(await store.create(contractThing, pagedScope, thing({ rank: 1 }))));
    for (const orderBy of [undefined, { field: 'rank' as const, direction: 'asc' as const }]) {
      const seen: string[] = [];
      for (let offset = 0; offset < 7; offset += 3)
        for (const item of await store.list(contractThing, pagedScope, {
          orderBy,
          limit: 3,
          offset,
        }))
          seen.push(item.ref.id);
      assert.deepEqual(
        [...seen].sort(),
        paged.map((item) => item.ref.id).sort(),
        'every document exactly once across pages'
      );
    }

    assert.equal(await store.count(contractThing, listScope), 4);
    assert.equal(await store.count(contractThing, listScope, { where: { isPublic: true } }), 2);

    // Search matches words and never crosses a scope boundary.
    const searchable = track(
      await store.create(contractThing, listScope, thing({ name: 'Rusty Anchor', tags: ['docks'] }))
    );
    track(await store.create(contractThing, otherScope, thing({ name: 'Rusty Anchor' })));
    const found = await store.list(contractThing, listScope, { search: 'rusty', limit: 10 });
    assert.deepEqual(
      found.map((item) => item.ref.id),
      [searchable.ref.id]
    );
    assert.equal(
      (await store.list(contractThing, listScope, { search: 'docks', limit: 10 })).length,
      1
    );
    assert.equal(
      (await store.list(contractThing, listScope, { search: 'nonexistentword', limit: 10 })).length,
      0
    );

    // Rejected inputs never reach the store.
    await assert.rejects(
      store.create(contractThing, scope, { ...thing(), rank: 1.5 } as Thing),
      /Invalid ContractThing value/
    );
    await assert.rejects(store.list(contractThing, scope, { limit: 0 }), /limit/);
    await assert.rejects(store.list(contractThing, scope, { limit: 501 }), /limit/);

    // Edges: replace, preserve order, traverse both directions and delete with the vertex.
    const town = track(await store.create(contractLink, scope, { name: 'Bree' }));
    const quarters = [];
    for (const name of ['North Gate', 'Market', 'Docks'])
      quarters.push(track(await store.create(contractLink, scope, { name })));
    await store.setEdges(
      town.ref,
      'WITHIN',
      quarters.map((item) => item.ref)
    );
    assert.deepEqual(
      (await store.edges(town.ref, 'WITHIN', 'out', 10)).map((ref) => ref.id),
      quarters.map((item) => item.ref.id)
    );
    assert.deepEqual(
      (await store.edges(quarters[0].ref, 'WITHIN', 'in', 10)).map((ref) => ref.id),
      [town.ref.id]
    );
    await store.setEdges(town.ref, 'WITHIN', [quarters[2].ref, quarters[0].ref]);
    assert.deepEqual(
      (await store.edges(town.ref, 'WITHIN', 'out', 10)).map((ref) => ref.id),
      [quarters[2].ref.id, quarters[0].ref.id]
    );
    assert.equal((await store.edges(quarters[1].ref, 'WITHIN', 'in', 10)).length, 0);

    // Bounded traversal reaches descendants, survives a cycle and respects the limit.
    const deep = track(await store.create(contractLink, scope, { name: 'Cellar' }));
    await store.setEdges(quarters[2].ref, 'WITHIN', [deep.ref]);
    const descendants = await store.traverse(town.ref, 'WITHIN', 'out', 8, 100);
    assert.deepEqual(
      new Set(descendants.map((ref) => ref.id)),
      new Set([quarters[2].ref.id, quarters[0].ref.id, deep.ref.id])
    );
    await store.setEdges(deep.ref, 'WITHIN', [town.ref]);
    const cyclic = await store.traverse(town.ref, 'WITHIN', 'out', 8, 100);
    assert.ok(cyclic.length <= 4, 'a cycle terminates');
    assert.equal((await store.traverse(town.ref, 'WITHIN', 'out', 8, 2)).length, 2);

    // Removal deletes the vertex and its edges.
    assert.equal(await store.remove(contractLink, scope, quarters[2].ref.id), true);
    assert.equal(await store.get(contractLink, scope, quarters[2].ref.id), null);
    assert.equal(await store.remove(contractLink, scope, quarters[2].ref.id), false);
    assert.deepEqual(
      (await store.edges(town.ref, 'WITHIN', 'out', 10)).map((ref) => ref.id),
      [quarters[0].ref.id]
    );
    await assert.rejects(
      store.update(contractLink, scope, quarters[2].ref.id, 1, { name: 'Gone' }),
      /No ContractNode/
    );
  } finally {
    // A cleanup failure must not hide the contract failure that caused it, but it must
    // still fail the run when the contract itself passed.
    cleanupFailure = await cleanup(created).then(
      () => undefined,
      (error: unknown) => error
    );
  }
  if (cleanupFailure) throw cleanupFailure;
}
