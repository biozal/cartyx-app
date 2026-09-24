import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/server/repositories/entity-store', () => import('./entityStoreDouble'));

const { resetEntityStore } = await import('./entityStoreDouble');
const { AudioAsset } = await import('~/server/db/models/AudioAsset');
const { getUserStorageUsage } = await import('~/server/functions/audio-quota');

const OWNER = '1'.repeat(24);
const OTHER = '2'.repeat(24);

async function seed(ownerId: string, fields: Record<string, unknown>) {
  return AudioAsset.create({
    ownerId,
    title: 'track',
    kind: 'music',
    sourceKey: 'audio/track.wav',
    ...fields,
  });
}

describe('getUserStorageUsage', () => {
  beforeEach(() => resetEntityStore());

  it('sums all six byte-bearing fields', async () => {
    await seed(OWNER, {
      sourceBytes: 100,
      onceSourceBytes: 200,
      renditions: { opus: { bytes: 4 }, aac: { bytes: 8 } },
      onceRenditions: { opus: { bytes: 16 }, aac: { bytes: 32 } },
    });
    expect(await getUserStorageUsage(OWNER)).toEqual({ bytes: 360, assetCount: 1 });
  });

  it('treats absent and null byte fields as zero, not NaN', async () => {
    await seed(OWNER, { sourceBytes: null });
    const usage = await getUserStorageUsage(OWNER);
    expect(usage.bytes).toBe(0);
    expect(Number.isNaN(usage.bytes)).toBe(false);
  });

  it('counts every status, not only ready', async () => {
    await seed(OWNER, { status: 'pending', sourceBytes: 50 });
    expect((await getUserStorageUsage(OWNER)).bytes).toBe(50);
  });

  it("never counts another user's assets", async () => {
    await seed(OTHER, { sourceBytes: 999 });
    expect(await getUserStorageUsage(OWNER)).toEqual({ bytes: 0, assetCount: 0 });
  });
});
