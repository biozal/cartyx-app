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
