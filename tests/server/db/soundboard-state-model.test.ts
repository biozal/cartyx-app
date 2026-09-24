// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/server/repositories/entity-store', () => import('../functions/entityStoreDouble'));
import { resetEntityStore } from '../functions/entityStoreDouble';
import { SoundboardState, soundboardStateSchema } from '~/server/db/models/SoundboardState';
import { DEFAULT_VOLUME } from '~/types/soundboard';

const ID = '65c0000000000000000000c1';
const USER = '65c0000000000000000000a1';

beforeEach(() => resetEntityStore());

describe('SoundboardState model', () => {
  it('allows a document with only campaignId and updatedBy set, filling the defaults', () => {
    expect(soundboardStateSchema.parse({ _id: ID, campaignId: ID, updatedBy: USER })).toMatchObject(
      {
        packageId: null,
        moodId: null,
        items: [],
        masterVolume: DEFAULT_VOLUME,
      }
    );
  });

  it('requires campaignId and updatedBy', () => {
    expect(soundboardStateSchema.safeParse({ _id: ID, updatedBy: USER }).success).toBe(false);
    expect(soundboardStateSchema.safeParse({ _id: ID, campaignId: ID }).success).toBe(false);
  });

  it('keeps moodId and items.itemId as plain strings, and gives items no ids', () => {
    const state = soundboardStateSchema.parse({
      _id: ID,
      campaignId: ID,
      updatedBy: USER,
      moodId: 'calm',
      items: [{ itemId: 'rain' }],
    });
    expect(state.moodId).toBe('calm');
    expect(state.items).toEqual([{ itemId: 'rain', playing: false, volume: DEFAULT_VOLUME }]);
  });

  it('holds one live state per campaign, even when upserts race', async () => {
    await Promise.all(
      Array.from({ length: 4 }, (_, n) =>
        SoundboardState.findOneAndUpdate(
          { campaignId: ID },
          { $set: { masterVolume: n / 10, updatedBy: USER } },
          { upsert: true, new: true }
        )
      )
    );
    expect(await SoundboardState.countDocuments({ campaignId: ID })).toBe(1);
  });
});
