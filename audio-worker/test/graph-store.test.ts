import { beforeEach, describe, expect, it, vi } from 'vitest';

// The worker's store is the app's AudioAsset graph model behind the driver interface.
// Here it runs on the app's in-memory entity store, which satisfies the same contract
// as JanusGraph, so the claim's real filter and update are exercised end to end.
vi.mock(
  '../../app/server/repositories/entity-store',
  () => import('../../tests/server/functions/entityStoreDouble')
);
import { resetEntityStore } from '../../tests/server/functions/entityStoreDouble';
import { graphCollection } from '../../app/server/db/graph-driver';
import { AudioAsset } from '../../app/server/db/models/AudioAsset';
import { claimNext, reapStale, type ClaimModel } from '../src/claim.js';

const OWNER = '65c0000000000000000000a1';
const model = () => graphCollection(AudioAsset) as unknown as ClaimModel;

async function pending(title: string, createdAt: Date, extra: Record<string, unknown> = {}) {
  return AudioAsset.create({
    ownerId: OWNER,
    title,
    kind: 'music',
    sourceKey: `audio/${title}`,
    status: 'pending',
    createdAt,
    ...extra,
  });
}

type Claimed = { _id: { toString(): string }; title: string; attempts: number; status: string };

beforeEach(() => resetEntityStore());

describe('the worker against the graph store', () => {
  it('claims the oldest pending asset and marks it processing', async () => {
    await pending('newer', new Date(2000));
    await pending('older', new Date(1000));
    const claimed = await claimNext<Claimed>(model(), 'worker-a');
    expect(claimed).toMatchObject({ title: 'older', status: 'processing', attempts: 1 });
    const stored = await AudioAsset.findOne({ title: 'older' }).lean();
    expect(stored).toMatchObject({ status: 'processing', claimedBy: 'worker-a' });
  });

  it('never lets two workers claim the same asset', async () => {
    for (let n = 0; n < 3; n++) await pending(`a${n}`, new Date(n * 1000));
    const claims = await Promise.all(
      ['w1', 'w2', 'w3', 'w4', 'w5'].map((worker) => claimNext<Claimed>(model(), worker))
    );
    const titles = claims.filter(Boolean).map((c) => c!.title);
    expect(titles.sort()).toEqual(['a0', 'a1', 'a2']);
    expect(claims.filter((c) => c === null)).toHaveLength(2);
  });

  it('skips an asset whose retry backoff has not elapsed', async () => {
    await pending('waiting', new Date(1000), { nextAttemptAt: new Date(Date.now() + 60_000) });
    await pending('ready', new Date(2000), { nextAttemptAt: new Date(Date.now() - 1_000) });
    expect((await claimNext<Claimed>(model(), 'w'))?.title).toBe('ready');
    expect(await claimNext<Claimed>(model(), 'w')).toBeNull();
  });

  it('requeues a stale claim', async () => {
    await pending('stuck', new Date(1000), {
      status: 'processing',
      claimedAt: new Date(Date.now() - 3_600_000),
      attempts: 1,
    });
    await reapStale(model(), 60_000, 60_000);
    expect((await AudioAsset.findOne({ title: 'stuck' }).lean())?.status).toBe('pending');
  });
});
