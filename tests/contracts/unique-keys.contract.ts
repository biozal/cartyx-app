import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  defineCollection,
  objectIdString,
  UniqueConstraintError,
} from '~/server/repositories/collection';

/**
 * What a collection's unique keys must guarantee — the job a MongoDB unique index did —
 * run against the in-memory store in unit tests and against real JanusGraph by
 * `scripts/graph/repositories-integration.ts`. Concurrency is where the two stores have
 * differed before, so the races are proven on both.
 *
 * Every value is fresh and everything created is removed, so it can run against a
 * shared development graph.
 */
const id = () => randomBytes(12).toString('hex');

const labels = defineCollection({
  name: 'contractuniquelabels',
  kind: 'ContractUniqueLabel',
  schema: z.object({
    _id: objectIdString,
    scopeId: objectIdString,
    name: z.string(),
    note: z.string().default(''),
  }),
  index: { scopeId: 'ix_s1', name: 'ix_s2' },
  unique: { scopeId_name: (doc) => [doc.scopeId, doc.name] },
});

export async function uniqueKeysContract() {
  const scope = id();
  const other = id();
  const label = (name: string, scopeId = scope) => ({ _id: id(), scopeId, name, note: '' });

  try {
    // A second document with the same key is refused, and the refusal costs the holder
    // nothing; the same name elsewhere is a different key.
    const first = await labels.insert(label('alpha'));
    await assert.rejects(labels.insert(label('alpha')), UniqueConstraintError);
    await labels.insert(label('alpha', other));
    assert.equal((await labels.findAll({ where: { scopeId: scope } })).length, 1);

    // Re-inserting a stored _id fails, and must not release the stored document's key.
    await assert.rejects(labels.insert({ ...first, note: 'again' }));
    await assert.rejects(labels.insert(label('alpha')), UniqueConstraintError);

    // Five concurrent inserts of one key: exactly one wins.
    const racers = await Promise.allSettled(
      Array.from({ length: 5 }, () => labels.insert(label('contested')))
    );
    assert.equal(racers.filter((r) => r.status === 'fulfilled').length, 1);
    for (const r of racers)
      if (r.status === 'rejected' && !(r.reason instanceof UniqueConstraintError)) throw r.reason;

    // Renaming claims the new key and frees the old one; renaming onto a taken key is
    // refused and leaves the document as it was.
    await labels.update(first._id, (doc) => ({ ...doc, name: 'beta' }));
    await labels.insert(label('alpha'));
    await assert.rejects(
      labels.update(first._id, (doc) => ({ ...doc, name: 'alpha' })),
      UniqueConstraintError
    );
    assert.equal((await labels.get(first._id))?.name, 'beta');
    await assert.rejects(labels.insert(label('beta')), UniqueConstraintError);

    // Edits that keep the key keep it, even when they race.
    await Promise.all(
      Array.from({ length: 4 }, (_, n) =>
        labels.update(first._id, (doc) => ({ ...doc, note: `${doc.note}${n}` }))
      )
    );
    assert.equal((await labels.get(first._id))?.note.length, 4);
    await assert.rejects(labels.insert(label('beta')), UniqueConstraintError);

    // Two documents racing to rename onto one free key: exactly one gets it.
    const [a, b] = [await labels.insert(label('a')), await labels.insert(label('b'))];
    const renames = await Promise.allSettled(
      [a, b].map((doc) => labels.update(doc._id, (d) => ({ ...d, name: 'target' })))
    );
    assert.equal(renames.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await labels.findAll({ where: { scopeId: scope, name: 'target' } })).length, 1);

    // Removal frees the key.
    assert.equal(await labels.remove(first._id), true);
    await labels.insert(label('beta'));
  } finally {
    await labels.removeWhere({ scopeId: scope });
    await labels.removeWhere({ scopeId: other });
  }
}
