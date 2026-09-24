import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => vi.restoreAllMocks());

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

  it('treats a NESTED null bytes field as zero without poisoning the sibling fields', async () => {
    // `sourceBytes` at the top level is covered above; this is the same guard
    // one level down, where `bytesAt`'s dotted-path walk has to thread through
    // an intermediate object (`renditions.opus`) before it ever reaches the
    // leaf. `aac.bytes` is the control: if the guard failed here the way
    // Mongo's `$add` used to (one null poisoning the WHOLE sum, not just its
    // own term), this would assert 8, not the poisoned NaN.
    await seed(OWNER, {
      sourceBytes: 100,
      renditions: { opus: { bytes: null }, aac: { bytes: 8 } },
    });
    const usage = await getUserStorageUsage(OWNER);
    expect(usage).toEqual({ bytes: 108, assetCount: 1 });
    expect(Number.isNaN(usage.bytes)).toBe(false);
  });

  it('treats a non-finite bytes field as zero without poisoning the sibling fields', async () => {
    // The current `AudioAsset` schema (`z.number()`) rejects `Infinity`/`NaN`
    // on write, so this row shape can't be produced through `AudioAsset.create`
    // — `bytesAt`'s finiteness check defends against it anyway (a legacy row,
    // a future schema loosening, or a write that reached the store some other
    // way), so this test bypasses the model and feeds `getUserStorageUsage`
    // exactly the row shape `bytesAt` exists to survive. `sourceBytes: 100`
    // and `aac.bytes: 8` are the controls: if either non-finite addend
    // propagated the way `NaN`/`Infinity` propagate through plain `+`, the
    // total would not be 108.
    vi.spyOn(AudioAsset, 'find').mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            ownerId: OWNER,
            sourceBytes: 100,
            onceSourceBytes: Number.POSITIVE_INFINITY,
            renditions: { opus: { bytes: Number.NaN }, aac: { bytes: 8 } },
          },
        ]),
    } as any);

    const usage = await getUserStorageUsage(OWNER);
    expect(usage).toEqual({ bytes: 108, assetCount: 1 });
    expect(Number.isNaN(usage.bytes)).toBe(false);
  });
});
