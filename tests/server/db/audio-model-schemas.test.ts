// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/server/repositories/entity-store', () => import('../functions/entityStoreDouble'));
import { resetEntityStore } from '../functions/entityStoreDouble';
import { AudioAsset, audioAssetSchema } from '~/server/db/models/AudioAsset';
import { audioPackageSchema } from '~/server/db/models/AudioPackage';

/**
 * The audio schemas are a contract between the web app and the worker, which writes
 * through the same model. These pin the defaults and the fields each side relies on.
 */
const ID = '65c0000000000000000000a1';
const asset = (extra: Record<string, unknown> = {}) => ({
  _id: ID,
  ownerId: ID,
  title: 'Rain',
  kind: 'ambience',
  sourceKey: 'audio/rain.wav',
  ...extra,
});

beforeEach(() => resetEntityStore());

describe('AudioAsset schema', () => {
  it('defaults status to uploading, peaks to empty and the worker fields to null', () => {
    expect(audioAssetSchema.parse(asset())).toMatchObject({
      status: 'uploading',
      variant: 'main',
      peaks: [],
      attempts: 0,
      permanentFailure: false,
      confirmedAt: null,
      nextAttemptAt: null,
      durationSamples: null,
      claimedBy: null,
      renditions: {},
      onceRenditions: {},
    });
  });

  it('keeps the fields the worker writes', () => {
    const parsed = audioAssetSchema.parse(
      asset({
        nextAttemptAt: new Date(5),
        durationSamples: 48000,
        permanentFailure: true,
        renditions: { opus: { key: 'k', url: 'u', bytes: 3 } },
      })
    );
    expect(parsed).toMatchObject({
      nextAttemptAt: new Date(5),
      durationSamples: 48000,
      permanentFailure: true,
      renditions: { opus: { key: 'k', url: 'u', bytes: 3 } },
    });
  });

  it('defaults the once-variant byte and clock fields to null', () => {
    expect(audioAssetSchema.parse(asset())).toMatchObject({
      onceSourceKey: null,
      onceSourceBytes: null,
      onceUploadStartedAt: null,
    });
  });

  /**
   * Zod strips what the schema does not declare, and `audioAssetSchema.parse` runs
   * inside the compare-and-set mutator on every create and every update — so an
   * undeclared field vanishes from a `$set` with no error at all, exactly as
   * Mongoose's strict mode used to drop an undeclared path. Both of these are
   * written from several places (the app's confirm/attach writes, the worker's
   * `markOnceFailed` and its two reapers), read by the storage quota and by the
   * once-reaper's liveness window, and neither side would notice the loss: the
   * quota would silently under-count once-source bytes forever and the reaper
   * would never see an abandoned attach. Pinned here as a write-through, not just
   * a parse, because that is the shape of the failure.
   */
  it('keeps the once-variant byte and clock fields through an update', async () => {
    const created = await AudioAsset.create(asset({ _id: undefined }));
    const startedAt = new Date('2026-09-22T00:00:00.000Z');
    await AudioAsset.updateOne(
      { _id: created._id },
      { $set: { onceSourceBytes: 4_096, onceUploadStartedAt: startedAt } }
    );
    const reloaded = await AudioAsset.findOne({ _id: created._id }).lean();
    expect(reloaded).toMatchObject({ onceSourceBytes: 4_096, onceUploadStartedAt: startedAt });
  });

  /**
   * Ported from the Mongoose-era `audio-asset-model.test.ts`, which asserted that a
   * `failed` asset could go without a source while an active one could not. The
   * conditional-required rule is gone: `sourceKey` is now plainly nullable, because
   * `reapRejectedUploads` clears it once it has reclaimed the R2 object so the row
   * cannot be re-reaped. What still has to hold is that a cleared source parses —
   * an explicit null, and an absent value defaulting to null.
   */
  it('accepts a null sourceKey so the reject-reaper can clear it', () => {
    expect(audioAssetSchema.parse(asset({ sourceKey: null })).sourceKey).toBeNull();
    expect(
      audioAssetSchema.parse(asset({ sourceKey: undefined, status: 'failed' })).sourceKey
    ).toBeNull();
  });

  /**
   * The test above only proves `audioAssetSchema.parse` accepts a null
   * `sourceKey` — it never runs `parse` inside the compare-and-set mutator,
   * so it cannot catch the failure mode this file exists to catch: a schema
   * that declares the field non-nullable would still pass that test (`parse`
   * would throw on the literal `null` input, sure, but nothing there proves
   * a real UPDATE can WRITE a null over an existing value and have it stick).
   * The reject-reaper's actual write is `updateOne(..., { $set: { sourceKey:
   * null } })` against a row that already has a string key, so this pins the
   * one thing that matters: that write, through the real model, round-trips.
   */
  it('clears sourceKey to null through a real update, not just a parse', async () => {
    const created = await AudioAsset.create(asset({ _id: undefined }));
    await AudioAsset.updateOne({ _id: created._id }, { $set: { sourceKey: null } });
    const reloaded = await AudioAsset.findOne({ _id: created._id }).lean();
    expect(reloaded?.sourceKey).toBeNull();
  });

  /**
   * Ported from the Mongoose-era `audio-asset-model.test.ts`'s index test. The four
   * compound indexes it pinned have no equivalent here — `defineGraphModel` takes a
   * declarative field -> slot map — but the two things that test existed to protect
   * do carry over.
   *
   * There is still deliberately NO text index: `listAudioAssets` searches titles with
   * `{ $regex: escapeRegExp(search), $options: 'i' }`, and `$text` appears nowhere in
   * this codebase, so a search index over titles would only ever cost writes.
   *
   * And the map itself is the record of which field serves which query. Only indexed
   * fields are pushed down into the graph (`matching` in `graph-model.ts` drops every
   * filter key that is not in this map), so dropping an entry silently turns a
   * narrowed read into a collection scan. `onceUploadStartedAt` is the newest entry:
   * `reapAbandonedOnceUploads` ranges on it, and `ix_d2` is a Date slot, which
   * `assertSlotValue` requires of it.
   */
  it('declares no text index, and indexes exactly the fields that are filtered on', () => {
    const { codec } = AudioAsset.graphCollection;
    expect(codec.searchText).toBeUndefined();
    expect(codec.index).toEqual({
      ownerId: 'ix_s1',
      kind: 'ix_s2',
      status: 'ix_s3',
      variant: 'ix_s4',
      createdAt: 'ix_d1',
      onceUploadStartedAt: 'ix_d2',
    });
  });

  it('rejects an unknown kind and an intensity outside 1–5', () => {
    expect(audioAssetSchema.safeParse(asset({ kind: 'podcast' })).success).toBe(false);
    expect(audioAssetSchema.safeParse(asset({ intensity: 6 })).success).toBe(false);
  });

  it('normalizes tags when an asset is created', async () => {
    const created = await AudioAsset.create(asset({ _id: undefined, tags: ['Rain', 'rain'] }));
    expect(created.tags).toEqual(['rain']);
  });
});

describe('AudioPackage schema', () => {
  const pkg = (extra: Record<string, unknown> = {}) => ({ _id: ID, name: 'Tavern', ...extra });

  it('allows a null ownerId, which is what makes a package a system package', () => {
    expect(audioPackageSchema.parse(pkg()).ownerId).toBeNull();
    expect(audioPackageSchema.parse(pkg({ ownerId: ID })).ownerId).toBe(ID);
  });

  it('requires a name', () => {
    expect(audioPackageSchema.safeParse({ _id: ID }).success).toBe(false);
  });

  it('keeps item and mood ids as the plain strings they are, with no ids of their own', () => {
    const parsed = audioPackageSchema.parse(
      pkg({
        items: [{ id: 'i1', assetId: ID }],
        moods: [{ id: 'm1', name: 'Calm', states: [{ itemId: 'i1' }] }],
      })
    );
    expect(parsed.items[0]).not.toHaveProperty('_id');
    expect(parsed.moods[0]).not.toHaveProperty('_id');
    expect(parsed.moods[0].states[0]).toMatchObject({ itemId: 'i1', playing: false });
  });
});
