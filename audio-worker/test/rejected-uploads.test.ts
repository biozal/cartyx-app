import { afterEach, expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { reapRejectedUploads, reapStale, type ClaimModel } from '../src/claim.js';
import { makeSourceDeleter } from '../src/process.js';

vi.mock('../src/heartbeat.js', () => ({ beat: vi.fn() }));
vi.mock('../src/telemetry.js', () => ({ captureException: vi.fn() }));
vi.mock('../src/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function collection() {
  const rows: Record<string, unknown>[] = [
    {
      _id: 'rejected',
      status: 'failed',
      confirmedAt: null,
      sourceKey: 'replayed.wav',
      createdAt: new Date(0),
    },
    {
      _id: 'retryable',
      status: 'failed',
      confirmedAt: new Date(0),
      sourceKey: 'accepted.wav',
      createdAt: new Date(0),
    },
    {
      _id: 'recent',
      status: 'failed',
      confirmedAt: null,
      sourceKey: 'live-url.wav',
      createdAt: new Date(10000),
    },
  ];
  // Called just before `updateOne` resolves a fenced write. Lets a test stage
  // a race — a row's state changing between the `find` above and its own
  // turn in the fenced-write loop — the exact window the inverted ordering
  // exists to close.
  let onBeforeUpdate: (() => void) | undefined;
  const find = vi.fn((filter: Record<string, unknown>) => ({
    toArray: async () => {
      expect(filter).toMatchObject({
        status: 'failed',
        confirmedAt: null,
        sourceKey: { $ne: null },
      });
      return rows
        .filter(
          (row) =>
            row.status === filter.status &&
            row.confirmedAt == null &&
            row.sourceKey != null &&
            row.variant !== 'once' &&
            (row.createdAt as Date) < (filter.createdAt as { $lt: Date }).$lt
        )
        .map((row) => ({ ...row }));
    },
  }));
  const updateOne = vi.fn(
    async (
      filter: Record<string, unknown>,
      update: { $set: Record<string, unknown> }
    ): Promise<{ matchedCount: number }> => {
      onBeforeUpdate?.();
      const row = rows.find((candidate) =>
        Object.entries(filter).every(([key, value]) => candidate[key] === value)
      );
      if (!row) return { matchedCount: 0 };
      Object.assign(row, update.$set);
      return { matchedCount: 1 };
    }
  );
  return {
    rows,
    model: { find, updateOne } as unknown as ClaimModel,
    find,
    updateOne,
    onBeforeUpdate: (fn: () => void) => {
      onBeforeUpdate = fn;
    },
  };
}

it('reclaims replayed rejected uploads after expiry without destroying retryable sources', async () => {
  const { model, rows } = collection();
  const objects = new Set(['replayed.wav', 'accepted.wav', 'live-url.wav']);
  const remove = vi.fn(async (keys: string[]) => {
    for (const key of keys) objects.delete(key);
  });
  await reapRejectedUploads(model, new Date(5000), remove);
  expect(objects).toEqual(new Set(['accepted.wav', 'live-url.wav']));
  expect(rows[0].sourceKey).toBeNull();
  expect(rows[1].sourceKey).toBe('accepted.wav');
  // Second pass: row 0 now has `sourceKey: null`, so the `{ $ne: null }`
  // candidate filter must exclude it — the reaper's own idempotency check.
  await reapRejectedUploads(model, new Date(5000), remove);
  expect(remove).toHaveBeenCalledTimes(1);
});

it('clears sourceKey with $set: null rather than $unset', async () => {
  const { model, updateOne } = collection();
  await reapRejectedUploads(model, new Date(5000), vi.fn().mockResolvedValue(undefined));
  expect(updateOne).toHaveBeenCalledWith(
    { _id: 'rejected', status: 'failed', confirmedAt: null, sourceKey: 'replayed.wav' },
    { $set: { sourceKey: null, sourceBytes: null, updatedAt: expect.any(Date) } }
  );
});

it('does not delete R2 objects for a row that stops matching between the find and the fenced write', async () => {
  const { model, rows, onBeforeUpdate } = collection();
  // The row is confirmed between the candidate list and its own fenced write
  // — it is no longer reclaimable, and the fence must make that write a
  // no-op rather than authorizing the delete.
  onBeforeUpdate(() => {
    rows[0].confirmedAt = new Date();
  });
  const remove = vi.fn(async () => {});

  await reapRejectedUploads(model, new Date(5000), remove);

  expect(remove).not.toHaveBeenCalled();
  expect(rows[0].sourceKey).toBe('replayed.wav');
});

it('deletes only rows whose fenced write actually matched', async () => {
  const { model, rows, onBeforeUpdate } = collection();
  const deleted: string[] = [];
  // Bring the second candidate row into scope too, so both a matched and an
  // unmatched write happen in the same pass.
  rows[2].confirmedAt = null;
  rows[2].createdAt = new Date(0);
  let calls = 0;
  onBeforeUpdate(() => {
    calls += 1;
    if (calls === 1) rows[0].confirmedAt = new Date(); // races out row 0
  });
  const remove = vi.fn(async (keys: string[]) => {
    deleted.push(...keys);
  });

  await reapRejectedUploads(model, new Date(5000), remove);

  expect(deleted).toEqual(['live-url.wav']);
  expect(rows[0].sourceKey).toBe('replayed.wav');
  expect(rows[2].sourceKey).toBeNull();
});

it('does not retry a failed delete on a later pass, leaving the object to the orphan scan', async () => {
  const { model, rows } = collection();
  const remove = vi
    .fn()
    .mockRejectedValueOnce(new Error('R2 unavailable'))
    .mockResolvedValue(undefined);

  // Delete fails, but the fenced write already ran — matching
  // `reapAbandonedUploads`'s best-effort delete: the status/field write must
  // not be undone by an R2 outage.
  await reapRejectedUploads(model, new Date(5000), remove);
  expect(rows[0].sourceKey).toBeNull();
  expect(remove).toHaveBeenCalledTimes(1);

  // A second pass finds nothing left to reclaim: the candidate filter
  // already excludes the null-sourceKey row, so `remove` is NOT called
  // again — this is intended, not a gap. The fenced write already landed, so
  // the row is no longer "abandoned"; the object it failed to delete is
  // stranded, and cleaning it up is the owner-scoped orphan scan's job, the
  // same handoff `reapAbandonedUploads` relies on for its own best-effort
  // deletes.
  await reapRejectedUploads(model, new Date(5000), remove);
  expect(remove).toHaveBeenCalledTimes(1);
});

it('honors shutdown without starting rejected-upload cleanup', async () => {
  const { model, find } = collection();
  await reapRejectedUploads(model, new Date(5000), vi.fn(), () => false);
  expect(find).not.toHaveBeenCalled();
});

it('waits at least fifteen minutes even when upload timeout is configured below URL expiry', async () => {
  const now = Date.now();
  const find = vi.fn((_filter: Record<string, unknown>) => ({ toArray: async () => [] }));
  const model = {
    find,
    updateMany: vi.fn(async () => ({ modifiedCount: 0 })),
  } as unknown as ClaimModel;
  await reapStale(model, 1000, 1000, vi.fn());
  const filter = find.mock.calls
    .map((call) => call[0] as Record<string, unknown>)
    .find((query) => query.status === 'failed');
  expect((filter?.createdAt as { $lt: Date }).$lt.getTime()).toBeLessThanOrEqual(
    now - 900000 + 100
  );
});

it('treats partial R2 batch deletion errors as failures so cleanup cannot forget those keys', async () => {
  for (const name of [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'CDN_URL',
  ])
    vi.stubEnv(name, 'test');
  vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
    Errors: [{ Key: 'replayed.wav', Code: 'AccessDenied' }],
  } as never);
  await expect(makeSourceDeleter()(['replayed.wav'])).rejects.toThrow(
    'R2 refused to delete 1 audio objects'
  );
});
