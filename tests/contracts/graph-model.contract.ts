import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { newObjectId, objectIdString } from '~/server/repositories/collection';
import { defineGraphModel } from '~/server/repositories/graph-model';

/**
 * What the Mongoose-compatible graph model must do the way MongoDB did, run against the
 * in-memory store in unit tests and against real JanusGraph by
 * `scripts/graph/repositories-integration.ts`. Server functions keep their Mongoose
 * calls, so these are the semantics they rely on: filters, updates, upserts, projections,
 * ordering, document saves, and no lost update when writers race.
 *
 * Every campaign id is fresh and everything created is removed at the end.
 */
const hexId = () => randomBytes(12).toString('hex');

const Widget = defineGraphModel({
  name: 'contractwidgets',
  kind: 'ContractWidget',
  modelName: 'ContractWidget',
  schema: z.object({
    _id: objectIdString,
    campaignId: objectIdString,
    name: z.string(),
    kind: z.string().default('plain'),
    count: z.number().default(0),
    tags: z.array(z.string()).default([]),
    parts: z
      .array(z.object({ _id: objectIdString.default(newObjectId), label: z.string() }))
      .default([]),
    notes: z.string().optional(),
    createdAt: z.date().default(() => new Date()),
  }),
  index: { campaignId: 'ix_s1', name: 'ix_s2', kind: 'ix_s3', count: 'ix_n1' },
  searchText: (doc) => doc.name,
  unique: { campaignId_name: (doc) => [doc.campaignId, doc.name] },
});

export async function graphModelContract() {
  const campaignId = hexId();
  const otherCampaign = hexId();
  try {
    // create: defaults and a generated, creation-ordered _id.
    const first = await Widget.create({ campaignId, name: 'Iron Gate', tags: ['door'] });
    assert.match(first._id, /^[0-9a-f]{24}$/);
    assert.equal(first.kind, 'plain');
    assert.equal(first.id, first._id);
    await Widget.create([
      { campaignId, name: 'Oak Door', kind: 'door', count: 3, tags: ['door', 'wood'] },
      { campaignId, name: 'Stone Arch', kind: 'arch', count: 1, parts: [{ label: 'keystone' }] },
      { campaignId: otherCampaign, name: 'Iron Gate' },
    ]);

    // A unique index clash reports MongoDB's duplicate-key code.
    await assert.rejects(Widget.create({ campaignId, name: 'Oak Door' }), { code: 11000 });

    // Filters: indexed and unindexed fields, arrays, $in, $or, regex, dotted paths.
    const names = async (filter: Record<string, unknown>, sort: unknown = 'name') =>
      (
        await Widget.find(filter)
          .sort(sort as string)
          .lean()
      ).map((w) => w.name);
    assert.deepEqual(await names({ campaignId }), ['Iron Gate', 'Oak Door', 'Stone Arch']);
    assert.deepEqual(await names({ campaignId, tags: 'door' }), ['Iron Gate', 'Oak Door']);
    assert.deepEqual(await names({ campaignId, kind: { $in: ['door', 'arch'] } }), [
      'Oak Door',
      'Stone Arch',
    ]);
    assert.deepEqual(await names({ campaignId, $or: [{ count: { $gte: 3 } }, { kind: 'arch' }] }), [
      'Oak Door',
      'Stone Arch',
    ]);
    assert.deepEqual(await names({ campaignId, name: { $regex: '^iron', $options: 'i' } }), [
      'Iron Gate',
    ]);
    assert.deepEqual(await names({ campaignId, 'parts.label': 'keystone' }), ['Stone Arch']);
    assert.deepEqual(await names({ campaignId, notes: { $exists: false } }), [
      'Iron Gate',
      'Oak Door',
      'Stone Arch',
    ]);
    assert.deepEqual(await names({ campaignId, $text: { $search: 'gates oak' } }), [
      'Iron Gate',
      'Oak Door',
    ]);

    // Sort, skip, limit, projection.
    assert.deepEqual(await names({ campaignId }, { count: -1, name: 1 }), [
      'Oak Door',
      'Stone Arch',
      'Iron Gate',
    ]);
    const paged = await Widget.find({ campaignId }).sort('-name').skip(1).limit(1).lean();
    assert.deepEqual(
      paged.map((w) => w.name),
      ['Oak Door']
    );
    const projected = (await Widget.findOne(
      { campaignId, name: 'Stone Arch' },
      'name parts.label'
    ).lean()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(projected).sort(), ['_id', 'name', 'parts']);
    assert.deepEqual(projected.parts, [{ label: 'keystone' }]);

    // Lookups by id, counts, existence.
    assert.equal((await Widget.findById(first._id).lean())?.name, 'Iron Gate');
    assert.equal(await Widget.findById('not-an-id').lean(), null);
    assert.equal(await Widget.countDocuments({ campaignId }), 3);
    assert.equal((await Widget.exists({ campaignId, name: 'Oak Door' }))?._id !== undefined, true);
    assert.equal(await Widget.exists({ campaignId, name: 'Nothing' }), null);

    // Update operators, positional `$`, array filters, and a filter that no longer matches.
    const arch = (await Widget.findOne({ campaignId, name: 'Stone Arch' }).lean())!;
    await Widget.updateOne(
      { _id: arch._id },
      { $inc: { count: 2 }, $push: { tags: 'old' }, $set: { notes: 'mossy' } }
    );
    await Widget.updateOne(
      { _id: arch._id, 'parts.label': 'keystone' },
      { $set: { 'parts.$.label': 'capstone' } }
    );
    await Widget.updateOne({ _id: arch._id }, { $push: { parts: { label: 'pillar' } } });
    const partId = (await Widget.findById(arch._id).lean())!.parts[1]._id;
    await Widget.updateOne(
      { _id: arch._id },
      { $set: { 'parts.$[p].label': 'column' } },
      { arrayFilters: [{ 'p._id': partId }] }
    );
    const archNow = (await Widget.findById(arch._id).lean())!;
    assert.equal(archNow.count, 3);
    assert.deepEqual(archNow.tags, ['old']);
    assert.equal(archNow.notes, 'mossy');
    assert.deepEqual(
      archNow.parts.map((p) => p.label),
      ['capstone', 'column']
    );
    assert.match(archNow.parts[1]._id, /^[0-9a-f]{24}$/, 'subdocuments get ids, as in Mongoose');
    const missed = await Widget.updateOne({ _id: arch._id, count: 99 }, { $set: { count: 0 } });
    assert.equal(missed.matchedCount, 0);
    await Widget.updateOne({ _id: arch._id }, { $pull: { parts: { label: 'column' } } });
    assert.equal((await Widget.findById(arch._id).lean())!.parts.length, 1);

    // Upserts: seeded from the filter, $setOnInsert only on insert.
    const upserted = await Widget.updateOne(
      { campaignId, name: 'Well' },
      { $set: { kind: 'water' }, $setOnInsert: { count: 7 } },
      { upsert: true }
    );
    assert.equal(upserted.upsertedCount, 1);
    await Widget.updateOne(
      { campaignId, name: 'Well' },
      { $set: { kind: 'dry' }, $setOnInsert: { count: 100 } },
      { upsert: true }
    );
    const well = (await Widget.findOne({ campaignId, name: 'Well' }).lean())!;
    assert.deepEqual([well.kind, well.count], ['dry', 7]);

    // Racing upserts of one unique key: one document, every update applied.
    await Promise.all(
      Array.from({ length: 4 }, () =>
        Widget.updateOne(
          { campaignId, name: 'Contested' },
          { $inc: { count: 1 } },
          { upsert: true }
        )
      )
    );
    const contested = await Widget.find({ campaignId, name: 'Contested' }).lean();
    assert.equal(contested.length, 1);
    assert.equal(contested[0].count, 4);

    // Racing increments on one document lose nothing.
    await Promise.all(
      Array.from({ length: 5 }, () => Widget.updateOne({ _id: first._id }, { $inc: { count: 1 } }))
    );
    assert.equal((await Widget.findById(first._id).lean())!.count, 5);

    // A conditional update is re-checked against the version it writes: five racers
    // incrementing while below three stop at three.
    const capped = await Widget.create({ campaignId, name: 'Capped' });
    await Promise.all(
      Array.from({ length: 5 }, () =>
        Widget.updateOne({ _id: capped._id, count: { $lt: 3 } }, { $inc: { count: 1 } })
      )
    );
    assert.equal((await Widget.findById(capped._id).lean())!.count, 3);

    // A writer whose target stops matching looks again: four racers claiming free slots
    // take four different slots.
    for (let n = 0; n < 4; n++)
      await Widget.create({ campaignId, name: `Slot ${n}`, kind: 'slot' });
    const claims = await Promise.all(
      Array.from({ length: 4 }, (_, n) =>
        Widget.updateOne(
          { campaignId, kind: 'slot', notes: { $exists: false } },
          { $set: { notes: `holder ${n}` } }
        )
      )
    );
    assert.deepEqual(
      claims.map((c) => c.modifiedCount),
      [1, 1, 1, 1]
    );
    const holders = (await Widget.find({ campaignId, kind: 'slot' }).lean()).map((w) => w.notes);
    assert.equal(new Set(holders).size, 4);

    // findOneAndUpdate returns the document before, or after with `new`.
    const before = await Widget.findOneAndUpdate(
      { _id: first._id },
      { $set: { kind: 'x' } }
    ).lean();
    assert.equal(before?.kind, 'plain');
    const after = await Widget.findOneAndUpdate(
      { _id: first._id },
      { $set: { kind: 'y' } },
      { new: true }
    ).lean();
    assert.equal(after?.kind, 'y');

    // A document's save() writes only what it changed, onto the latest stored version.
    const doc = (await Widget.findById(first._id))!;
    doc.notes = 'painted';
    await Widget.updateOne({ _id: first._id }, { $inc: { count: 10 } });
    await doc.save();
    const saved = (await Widget.findById(first._id).lean())!;
    assert.deepEqual([saved.notes, saved.count], ['painted', 15]);
    const fresh = new Widget({ campaignId, name: 'Built' });
    assert.equal(fresh.isNew, true);
    await fresh.save();
    assert.equal((await Widget.findById(fresh._id).lean())?.name, 'Built');
    assert.equal(fresh.toObject().name, 'Built');
    assert.equal((await (await Widget.findById(fresh._id))!.deleteOne()).deletedCount, 1);
    // Like Mongoose, saving a document that was deleted meanwhile fails.
    await assert.rejects(fresh.save());
    await Widget.create({ campaignId, name: 'Built' });

    // updateMany, bulkWrite, deletes.
    const many = await Widget.updateMany({ campaignId, kind: 'door' }, { $set: { count: 0 } });
    assert.equal(many.matchedCount, 1);
    await Widget.bulkWrite([
      { insertOne: { document: { campaignId, name: 'Bulk' } } },
      { updateOne: { filter: { campaignId, name: 'Bulk' }, update: { $set: { kind: 'b' } } } },
      { deleteOne: { filter: { campaignId, name: 'Built' } } },
    ]);
    assert.equal((await Widget.findOne({ campaignId, name: 'Bulk' }).lean())?.kind, 'b');
    assert.equal(await Widget.exists({ campaignId, name: 'Built' }), null);
    // Deleting frees the unique key.
    await Widget.create({ campaignId, name: 'Built' });
    assert.equal((await Widget.deleteMany({ campaignId: otherCampaign })).deletedCount, 1);
  } finally {
    await Widget.deleteMany({ campaignId });
    await Widget.deleteMany({ campaignId: otherCampaign });
  }
}
