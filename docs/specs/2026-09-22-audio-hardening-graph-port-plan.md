# Audio Hardening — JanusGraph Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land PR #548's audio hardening controls on the JanusGraph stack, with every control keeping its original guarantee.

**Architecture:** Merge `dev` into `audio-hardening` and fix forward. The models are re-expressed from Mongoose schemas to Zod; the storage quota trades a `$group` pipeline for a pushed-down read plus an in-process sum; the package visibility `$or` is split into two pushed-down queries, which is what actually bounds peak heap; and the worker's reject-reaper is corrected to fence before it deletes.

**Tech Stack:** TanStack Start (React 19), Zod 4, `defineGraphModel` over JanusGraph + Cassandra, mingo for MongoDB filter/update semantics, Vitest, Playwright, esbuild (audio-worker).

**Spec:** [`docs/specs/2026-09-22-audio-hardening-graph-port-design.md`](./2026-09-22-audio-hardening-graph-port-design.md)

## Global Constraints

- Every PR targets `dev`. **NEVER** open a PR against `main`.
- `npm run typecheck` and `npm run lint` must both be clean — `lint` runs with `--max-warnings 0`, so any new warning fails CI.
- Worker changes require `(cd audio-worker && npm run typecheck && npm test)`; the root suite does not cover it.
- Anything under `deploy/charts/` requires `bash deploy/charts/cartyx/tests/render-tests.sh`.
- `deploy/charts/` is prettierignored — do not format it.
- A refusal (rate limit, quota, job cap, not-found) must **never** file a GlitchTip event. The one deliberate exception is a quota-aggregation _failure_, which is a genuine server fault.
- Never `await` telemetry capture calls on request-critical paths.
- The graph layer has **no** `aggregate()`, no `distinct()`, no `populate()`, and no multi-document transactions. `bulkWrite` has no cross-document atomicity.
- `_id` is a lowercase 24-hex **string**, not an ObjectId.
- Zod **strips unknown keys**, and `schema.parse` runs on every create and every update. A `$set` naming an undeclared field is silently discarded.
- A new schema field carrying a `.default()` needs no version bump — the default backfills at parse, so no migration is required.
- Index slots are a fixed typed list. On `AudioAsset`, `ix_s1`–`ix_s4` and `ix_d1` are taken; `ix_s5`–`ix_s8`, all numeric/boolean slots and `ix_d2` are free.

---

### Task 1: Merge `dev` and re-express both models in Zod

**Files:**

- Modify: `app/server/db/models/AudioAsset.ts` (conflict, 3 hunks)
- Modify: `app/server/db/models/AudioPackage.ts` (conflict, 1 hunk)
- Modify: `package.json`, `docs/deployment.md`, `deploy/charts/cartyx/tests/render-tests.sh`, `e2e/globalSetup.ts` (conflicts)
- Delete: `tests/server/db/audio-asset-model.test.ts`
- Test: `tests/server/db/audio-model-schemas.test.ts`

**Interfaces:**

- Consumes: nothing (first task).
- Produces: `audioAssetSchema` with two new fields — `onceSourceBytes: number | null` and `onceUploadStartedAt: Date | null` — and `sourceKey: string | null`. `AudioAsset.index` gains `onceUploadStartedAt: 'ix_d2'`.

- [ ] **Step 1: Start the merge**

```bash
git checkout audio-hardening
git merge origin/dev --no-commit --no-ff
git diff --name-only --diff-filter=U
```

Expected: the 7 conflicting paths listed in **Files** above.

- [ ] **Step 2: Resolve the four non-model conflicts by taking `dev`'s side**

`package.json`, `docs/deployment.md`, `deploy/charts/cartyx/tests/render-tests.sh` and `e2e/globalSetup.ts`'s import block all conflict because `dev` removed MongoDB. Take `dev`'s content in each, then re-add only the branch's own additions (the `check:client-bundle` script in `package.json`, the branch's chart assertions in `render-tests.sh`).

```bash
git checkout --theirs package.json docs/deployment.md
# then re-add the branch's own additions by hand; see git diff against the merge-base
```

Do **not** resolve `e2e/globalSetup.ts` beyond its import block here — Task 7 rewrites its seeder.

- [ ] **Step 3: Delete the obsolete model test**

`dev` replaced this file with `audio-model-schemas.test.ts`. Its assertions are re-added in Step 7.

```bash
git rm tests/server/db/audio-asset-model.test.ts
```

- [ ] **Step 4: Resolve `AudioAsset.ts` — take `dev`'s Zod schema, then add the branch's fields**

Keep `dev`'s entire `defineGraphModel` structure. Make exactly three changes to it.

First, `sourceKey` becomes nullable (this is what Task 4's reaper fix requires):

```ts
  // Nullable because `reapRejectedUploads` (audio-worker/src/claim.ts) clears it
  // once it has reclaimed the R2 object, so the row cannot be re-reaped. Mirrors
  // `onceSourceKey` and `sourceBytes`, which have always been nullable.
  sourceKey: z.string().nullable().default(null),
```

Second, add `onceSourceBytes` immediately after `onceSourceKey`, carrying the branch's comment (the full INVARIANT block from the branch's version — it is load-bearing and must survive):

```ts
  onceSourceBytes: z.number().nullable().default(null),
```

Third, add `onceUploadStartedAt` after `onceLastError`:

```ts
  onceUploadStartedAt: z.coerce.date().nullable().default(null),
```

- [ ] **Step 5: Index `onceUploadStartedAt`**

`reapAbandonedOnceUploads` filters on it, so it needs a slot. `ix_d2` is free.

```ts
  index: {
    ownerId: 'ix_s1',
    kind: 'ix_s2',
    status: 'ix_s3',
    variant: 'ix_s4',
    createdAt: 'ix_d1',
    // The once-reaper's liveness clock: `reapAbandonedOnceUploads` ranges on it.
    onceUploadStartedAt: 'ix_d2',
  },
```

Discard the branch's four `audioAssetSchema.index(...)` calls entirely — `defineGraphModel` has no `index()` method, and the compound Mongo indexes have no equivalent. Keep the branch's comment explaining why there is deliberately no text index.

- [ ] **Step 6: Resolve `AudioPackage.ts`**

The branch's only change here is a 9-line comment on `updatedAt` explaining that it is the optimistic-concurrency precondition. Take `dev`'s Zod schema and attach that comment to its `updatedAt` field. No structural change.

- [ ] **Step 7: Extend the model-schema test for the new fields**

Add to `tests/server/db/audio-model-schemas.test.ts`:

```ts
it('defaults the once-variant byte and clock fields to null', () => {
  const parsed = audioAssetSchema.parse({
    _id: '0'.repeat(24),
    ownerId: '1'.repeat(24),
    title: 'x',
    kind: AUDIO_KINDS[0],
    sourceKey: 'audio/x.wav',
  });
  expect(parsed).toMatchObject({
    onceSourceBytes: null,
    onceUploadStartedAt: null,
  });
});

it('accepts a null sourceKey so the reject-reaper can clear it', () => {
  const parsed = audioAssetSchema.parse({
    _id: '0'.repeat(24),
    ownerId: '1'.repeat(24),
    title: 'x',
    kind: AUDIO_KINDS[0],
    sourceKey: null,
  });
  expect(parsed.sourceKey).toBeNull();
});
```

- [ ] **Step 8: Run the checks**

```bash
npm run typecheck
npx vitest run --project unit tests/server/db/audio-model-schemas.test.ts
```

Expected: typecheck clean; both new tests pass.

- [ ] **Step 9: Commit the merge**

```bash
git add -A
git commit -m "merge: bring dev's graph models into audio-hardening

Re-expresses both audio models as zod, adds onceSourceBytes and
onceUploadStartedAt, indexes the latter for the once-reaper, and makes
sourceKey nullable so the reject-reaper can clear it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Prove the new fields survive a real write

**Files:**

- Test: `tests/server/db/audio-asset-graph-roundtrip.test.ts` (create)

**Interfaces:**

- Consumes: `AudioAsset` from Task 1.
- Produces: nothing consumed later. This task exists solely as the detector for the silent-strip failure mode.

This is the single most important test in the plan. Zod strips unknown keys silently, so if Task 1's fields were missed, every `$set` of them is discarded with no error. Per-method model mocks cannot catch that — they return whatever they were told. This test runs the real model against the in-memory entity store.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/server/repositories/entity-store', () => import('../functions/entityStoreDouble'));

const { AudioAsset } = await import('~/server/db/models/AudioAsset');

describe('AudioAsset once-variant fields', () => {
  const base = {
    ownerId: '1'.repeat(24),
    title: 'track',
    kind: 'music' as const,
    sourceKey: 'audio/track.wav',
  };

  it('persists onceSourceBytes through an update', async () => {
    const created = await AudioAsset.create(base);
    await AudioAsset.updateOne({ _id: created._id }, { $set: { onceSourceBytes: 4096 } });
    const found = await AudioAsset.findById(created._id).lean();
    expect(found?.onceSourceBytes).toBe(4096);
  });

  it('persists onceUploadStartedAt through an update', async () => {
    const created = await AudioAsset.create(base);
    const startedAt = new Date('2026-09-22T00:00:00.000Z');
    await AudioAsset.updateOne({ _id: created._id }, { $set: { onceUploadStartedAt: startedAt } });
    const found = await AudioAsset.findById(created._id).lean();
    expect(found?.onceUploadStartedAt?.getTime()).toBe(startedAt.getTime());
  });

  it('clears sourceKey to null', async () => {
    const created = await AudioAsset.create(base);
    await AudioAsset.updateOne({ _id: created._id }, { $set: { sourceKey: null } });
    const found = await AudioAsset.findById(created._id).lean();
    expect(found?.sourceKey).toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run --project unit tests/server/db/audio-asset-graph-roundtrip.test.ts
```

Expected: PASS if Task 1 was done correctly. **If any assertion returns `null`/`undefined` instead of the written value, Task 1 missed that field** — go back and add it to the schema rather than adjusting this test.

- [ ] **Step 3: Commit**

```bash
git add tests/server/db/audio-asset-graph-roundtrip.test.ts
git commit -m "test(audio): prove the once-variant fields round-trip a real write

Zod strips undeclared keys silently, so a missing schema field makes every
\$set of it a no-op that no mocked-model test can detect.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Rewrite the storage quota without aggregation

**Files:**

- Modify: `app/server/functions/audio-quota.ts` (full rewrite of the query)
- Test: `tests/server/functions/audio-quota.test.ts` (rewrite — it currently mocks mongoose)

**Interfaces:**

- Consumes: `AudioAsset` from Task 1.
- Produces: `getUserStorageUsage(userId: string): Promise<{ bytes: number; assetCount: number }>` — unchanged signature, so `audio.ts`'s call sites need no edit.

- [ ] **Step 1: Write the failing test**

Replace the file's contents. No mongoose, no aggregate mock — run the real model on the entity-store double so the test also proves the filter is right.

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/server/repositories/entity-store', () => import('./entityStoreDouble'));

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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --project unit tests/server/functions/audio-quota.test.ts
```

Expected: FAIL — the current implementation imports `mongoose`, which no longer resolves.

- [ ] **Step 3: Rewrite the implementation**

Replace the `getUserStorageUsage` body and drop the mongoose import. Keep `BYTES_FIELD_PATHS` and its cross-reference comment to `audio-cleanup.ts`'s `referencedKeys` — that is still exactly right.

```ts
import { connectDB, isDBConnected } from '../db/connection';
import { AudioAsset } from '../db/models/AudioAsset';

/** Reads one dotted path, treating absent, null and non-finite alike as 0. */
function bytesAt(document: Record<string, unknown>, path: string): number {
  const value = path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      document
    );
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function getUserStorageUsage(userId: string): Promise<AudioStorageUsage> {
  await ensureDb();

  // `ownerId` is an indexed slot, so this narrows in the graph rather than
  // scanning. There is deliberately NO projection: the entity store persists
  // each document as one JSON blob, so asking for fewer fields reads exactly
  // the same bytes off the wire and only trims the objects afterwards.
  const rows = (await AudioAsset.find({ ownerId: userId }).lean()) as Record<string, unknown>[];

  let bytes = 0;
  for (const row of rows) {
    for (const path of BYTES_FIELD_PATHS) bytes += bytesAt(row, path);
  }
  return { bytes, assetCount: rows.length };
}
```

- [ ] **Step 4: Rewrite the module docblock**

The existing comment justifies the design with "one `$group` over one user's own assets, served by the existing `{ownerId, createdAt}` index". That premise is gone. Replace that paragraph with the honest one:

```
 * COST, AND WHY IT IS STILL THE RIGHT TRADE
 * -----------------------------------------
 * This reads the caller's own asset rows and adds them up in process. The
 * graph layer has no aggregation pipeline, and the entity store keeps each
 * document as a single JSON blob, so there is no projection that would make
 * the read cheaper — the rows come back whole either way.
 *
 * What bounds it is the quota itself: at the 2 GiB default and ~126 MB per
 * asset that is roughly 16 rows, and `ownerId` is an indexed slot so the read
 * narrows in the graph rather than scanning. A denormalised counter is still
 * the wrong answer for the same reason it always was — four writers, and the
 * phase 2a review found correctness bugs in three of them.
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run --project unit tests/server/functions/audio-quota.test.ts
npm run typecheck
```

Expected: all four tests PASS; typecheck clean.

- [ ] **Step 6: Verify the fail-closed path still holds**

`audio.ts` wraps `getUserStorageUsage` in a try/catch that refuses the upload. Confirm no `catch` was introduced inside `audio-quota.ts` that would swallow a read failure and return `{ bytes: 0 }` — that would silently admit every upload.

```bash
grep -n 'catch' app/server/functions/audio-quota.ts
```

Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add app/server/functions/audio-quota.ts tests/server/functions/audio-quota.test.ts
git commit -m "feat(audio): compute the storage quota without an aggregation pipeline

The graph layer has no aggregate(). Reads the caller's own rows through the
ownerId index and sums the six byte-bearing fields in process; still counts
every status and still fails closed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Fix the reject-reaper's ordering and its now-invalid `$unset`

**Files:**

- Modify: `audio-worker/src/claim.ts` (`reapRejectedUploads`)
- Test: `audio-worker/test/rejected-uploads.test.ts`

**Interfaces:**

- Consumes: the nullable `sourceKey` from Task 1.
- Produces: nothing consumed later.

Two defects in one function. `$unset: { sourceKey: '' }` throws against a required field, and the throw lands in a `catch` _after_ `deleteSource` already removed the R2 objects — so every pass re-lists the rows, re-deletes, and re-throws forever. The fix is to adopt the ordering its sibling `reapAbandonedUploads` already uses: fence first, collect keys from matched writes only, delete in batches at the end.

- [ ] **Step 1: Write the failing test**

```ts
it('does not delete R2 objects for a row that stopped matching', async () => {
  const deleted: string[] = [];
  const model = makeModel([
    { _id: id1, status: 'failed', confirmedAt: null, sourceKey: 'audio/a.wav' },
  ]);
  // The row is confirmed between the list and the fenced write.
  model.onBeforeUpdate(() => {
    model.rows[0].confirmedAt = new Date();
  });

  await reapRejectedUploads(model, new Date(), async (keys) => {
    deleted.push(...keys);
  });

  expect(deleted).toEqual([]);
});

it('clears sourceKey with null rather than unsetting it', async () => {
  const model = makeModel([
    { _id: id1, status: 'failed', confirmedAt: null, sourceKey: 'audio/a.wav' },
  ]);
  await reapRejectedUploads(model, new Date(), async () => {});
  expect(model.updates[0][1]).toEqual({
    $set: { sourceKey: null, sourceBytes: null, updatedAt: expect.any(Date) },
  });
});
```

Use the file's existing model double; add the `onBeforeUpdate` hook to it if it does not already have one.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd audio-worker && npx vitest run test/rejected-uploads.test.ts
```

Expected: FAIL — the first test sees `['audio/a.wav']` because the delete runs before the fence; the second sees a `$unset`.

- [ ] **Step 3: Rewrite the function body**

```ts
const rows = rejected.filter((row) => row.sourceKey);
if (rows.length === 0) return;

// Fence FIRST, delete after — the rule the rest of this file is built on.
// A row can be confirmed between the `find` above and the write below; the
// fence makes that write a no-op, and only a matched write authorizes
// removing the object. Deleting first (which this function used to do) hands
// the R2 delete to rows that are no longer reclaimable, and the deletes are
// not recoverable.
const reclaimable: string[] = [];
for (const row of rows) {
  if (shouldContinue && !shouldContinue()) break;
  const result = await model.updateOne(
    { _id: row._id, status: 'failed', confirmedAt: null, sourceKey: row.sourceKey },
    // `$set: null`, not `$unset`: `sourceKey` is a declared schema field, and
    // an unset makes the document fail its own parse on the way back in.
    { $set: { sourceKey: null, sourceBytes: null, updatedAt: new Date() } }
  );
  beat();
  // Explicit 0 only: the driver always reports matchedCount, and treating a
  // missing field as "didn't match" would silently stop reclaiming objects.
  if (result?.matchedCount === 0) continue;
  reclaimable.push(row.sourceKey as string);
}

if (reclaimable.length === 0) return;
try {
  await deleteSource(reclaimable);
  beat();
} catch (err) {
  logger.warn({ err }, 'failed to reclaim rejected audio uploads');
  captureException(err, { scope: 'reap-rejected' });
}
```

- [ ] **Step 4: Update the candidate filter**

`sourceKey: { $type: 'string' }` was always true against a required field. Now that the field is nullable it becomes the real idempotency predicate:

```ts
        sourceKey: { $ne: null },
```

- [ ] **Step 5: Run the worker suite**

```bash
cd audio-worker && npm run typecheck && npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add audio-worker/src/claim.ts audio-worker/test/rejected-uploads.test.ts
git commit -m "fix(worker): fence the reject-reaper before it deletes

\$unset threw against the now-required sourceKey, and the throw landed after
deleteSource had already run — so each pass re-deleted and re-threw forever.
Adopts reapAbandonedUploads' ordering: only a matched fenced write authorizes
the R2 delete.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Teach the store to query an absent index slot

**Files:**

- Modify: `app/server/db/graph/graph-entity-store.ts` (`applyFilters`)
- Modify: `app/server/repositories/graph-model.ts` (`matching`)
- Test: `tests/contracts/graph-model.contract.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `find({ field: null })` now pushes down as `hasNot(slot)` for any indexed field. Task 6 depends on this.

A null index value is written as an absent property (`writeProperties` drops it), so `has(slot, null)` can never match. Nothing could query for one. This closes that gap.

- [ ] **Step 1: Write the failing contract test**

Add to `tests/contracts/graph-model.contract.ts`, following the file's existing style:

```ts
// A null indexed value is stored as an absent property, so querying for one
// narrows with `hasNot` rather than an equality match.
const owned = await Widget.create({ name: 'owned', ownerId: 'a'.repeat(24) });
const system = await Widget.create({ name: 'system', ownerId: null });
const found = await Widget.find({ ownerId: null }).lean();
assert.deepEqual(
  found.map((w) => w._id),
  [system._id]
);
assert.ok(!found.some((w) => w._id === owned._id));
```

The contract's `Widget` model needs a nullable indexed `ownerId` if it has none; add it to the fixture definition in the same file.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --project unit tests/server/repositories/graph-model.test.ts
```

Expected: FAIL — `{ ownerId: null }` is currently not pushed down, and in-memory it may pass while the real-graph run would not; if it passes in memory, rely on Step 5's integration run.

- [ ] **Step 3: Emit `null` into the where clause**

In `graph-model.ts`'s `matching()`, inside the `for` over filter entries:

```ts
      for (const [key, value] of Object.entries(filter)) {
        if (!indexed.has(key)) continue;
        // `null` means the property is absent in the store — `writeProperties`
        // drops it rather than writing a null — so it narrows to `hasNot`.
        if (value === null) where[key] = null;
        else if (isIndexValue(value)) where[key] = value;
        else if (
```

Leave `isIndexValue` itself unchanged. It also guards `$in` arrays, and `P.within(...)` cannot express an absent property, so `$in: [x, null]` must keep falling back to an in-process filter.

- [ ] **Step 4: Translate it to `hasNot`**

In `graph-entity-store.ts`'s `applyFilters`:

```ts
if (filter === undefined) continue;
const value = filter as Filter;
// Absent-property match; see `writeProperties`, which drops null slots.
if (value === null) traversal = traversal.hasNot(slot);
else if (value && typeof value === 'object' && !(value instanceof Date) && 'within' in value)
  traversal = traversal.has(slot, P.within(...value.within.map(encodeIndexValue)));
else traversal = traversal.has(slot, encodeIndexValue(value as IndexValue));
```

- [ ] **Step 5: Run both the in-memory and the real-graph contract**

```bash
npx vitest run --project unit tests/server/repositories/graph-model.test.ts
npm run typecheck
```

Expected: PASS, clean. The real-JanusGraph run happens in CI's graph job via `scripts/graph/repositories-integration.ts`, which shares this contract file.

- [ ] **Step 6: Commit**

```bash
git add app/server/db/graph/graph-entity-store.ts app/server/repositories/graph-model.ts tests/contracts/graph-model.contract.ts
git commit -m "feat(graph): push down a null index filter as hasNot

A null index value is stored as an absent property, so it was unqueryable.
Every model gains it; listPackages is the first caller.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Split the package visibility `$or` and paginate `listPackages`

**Files:**

- Modify: `app/server/functions/packages.ts`
- Modify: `app/types/schemas/soundboard.ts` (add `limit`/`cursor` to the list input)
- Modify: `app/routes/audio_.packages.tsx`
- Test: `tests/server/functions/packages.test.ts`

**Interfaces:**

- Consumes: `hasNot` pushdown from Task 5.
- Produces: `listPackages({ data, userId, sessionUserId })` returns `{ items: AudioPackageSummaryData[]; nextCursor: string | null }` (was `{ items }`, and took no `data`).

The `$or` is invisible to pushdown, so `listPackages` reads every package in the install. Splitting it into two pushed-down arms is what bounds peak heap — the caller's own set is already capped at `MAX_PACKAGES_PER_USER`, and the system set is curated. The cursor is added for **response size and incremental rendering only**; it cannot bound the read, because `matching()` materialises everything before `page()` slices it.

The other three callers of `packageVisibilityFilter` — `getPackage`, `listPackageAssets`, `clonePackage` — all AND it with `_id`, which short-circuits to a single `collection.get(id)`. **Leave them exactly as they are.**

- [ ] **Step 1: Write the failing tests**

```ts
it("returns the caller's packages and the system ones", async () => {
  await AudioPackage.create({ ownerId: OWNER, name: 'mine' });
  await AudioPackage.create({ ownerId: null, name: 'system' });
  await AudioPackage.create({ ownerId: OTHER, name: 'theirs' });
  const { items } = await listPackages({
    data: { limit: 50 },
    userId: OWNER,
    sessionUserId: OWNER,
  });
  expect(items.map((p) => p.name).sort()).toEqual(['mine', 'system']);
});

it('queries each visibility arm with a pushed-down ownerId', async () => {
  const find = vi.spyOn(AudioPackage, 'find');
  await listPackages({ data: { limit: 50 }, userId: OWNER, sessionUserId: OWNER });
  const filters = find.mock.calls.map((c) => c[0]);
  expect(filters).toContainEqual({ ownerId: OWNER });
  expect(filters).toContainEqual({ ownerId: null });
  expect(filters.some((f) => '$or' in (f as object))).toBe(false);
});

it('pages by name and returns a cursor', async () => {
  for (const name of ['a', 'b', 'c']) await AudioPackage.create({ ownerId: OWNER, name });
  const first = await listPackages({ data: { limit: 2 }, userId: OWNER, sessionUserId: OWNER });
  expect(first.items.map((p) => p.name)).toEqual(['a', 'b']);
  expect(first.nextCursor).not.toBeNull();
  const second = await listPackages({
    data: { limit: 2, cursor: first.nextCursor! },
    userId: OWNER,
    sessionUserId: OWNER,
  });
  expect(second.items.map((p) => p.name)).toEqual(['c']);
  expect(second.nextCursor).toBeNull();
});

it('rejects an undecodable cursor rather than restarting at page 1', async () => {
  await expect(
    listPackages({ data: { limit: 2, cursor: 'garbage' }, userId: OWNER, sessionUserId: OWNER })
  ).rejects.toThrow('Invalid pagination cursor');
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run --project unit tests/server/functions/packages.test.ts
```

Expected: FAIL — `listPackages` takes no `data` and returns no `nextCursor`.

- [ ] **Step 3: Add the cursor codec**

The sort key is `name`, which is a free-text string, so the name half is base64url-encoded. The id half is always 24 hex, which contains no `_`, so `lastIndexOf('_')` splits unambiguously.

```ts
const PACKAGE_ID_RE = /^[0-9a-f]{24}$/;

function encodePackageCursor(name: string, id: string): string {
  return `${Buffer.from(name, 'utf8').toString('base64url')}_${id}`;
}

/** Returns null for anything this server did not mint — the caller fails closed. */
function decodePackageCursor(cursor: string): { name: string; id: string } | null {
  const idx = cursor.lastIndexOf('_');
  if (idx <= 0 || idx === cursor.length - 1) return null;
  const encodedName = cursor.slice(0, idx);
  const id = cursor.slice(idx + 1);
  if (!PACKAGE_ID_RE.test(id)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(encodedName)) return null;
  try {
    return { name: Buffer.from(encodedName, 'base64url').toString('utf8'), id };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rewrite `listPackages`**

```ts
export async function listPackages({
  data,
  userId,
  sessionUserId,
}: { data: z.infer<typeof listPackagesSchema> } & Actor): Promise<{
  items: AudioPackageSummaryData[];
  nextCursor: string | null;
}> {
  try {
    await ensureDb();

    // Two pushed-down reads rather than one `$or`. Pushdown only sees top-level
    // indexed keys, so the `$or` narrowed nothing and this read scanned every
    // package in the install. Split, each arm narrows on `ownerId`: the
    // caller's own set is capped by MAX_PACKAGES_PER_USER and the system set is
    // curated, which is what actually bounds this function's peak heap.
    const [mine, system] = (await Promise.all([
      AudioPackage.find({ ownerId: userId }, PACKAGE_SUMMARY_PROJECTION).lean(),
      AudioPackage.find({ ownerId: null }, PACKAGE_SUMMARY_PROJECTION).lean(),
    ])) as [PackageDoc[], PackageDoc[]];

    const ordered = [...mine, ...system].sort((a, b) => {
      const byName = String(a.name).localeCompare(String(b.name));
      return byName !== 0 ? byName : String(a._id).localeCompare(String(b._id));
    });

    let start = 0;
    if (data.cursor) {
      const decoded = decodePackageCursor(data.cursor);
      // Fail closed, exactly as listAudioAssets does: silently restarting at
      // page 1 appends page 1 underneath page 1 in an append-style UI.
      if (!decoded) throw new PackageClientError('Invalid pagination cursor');
      start = ordered.findIndex((p) => {
        const byName = String(p.name).localeCompare(decoded.name);
        return byName > 0 || (byName === 0 && String(p._id) > decoded.id);
      });
      if (start < 0) start = ordered.length;
    }

    const page = ordered.slice(start, start + data.limit);
    const items = page.map(serializePackageSummary);
    const last = page[page.length - 1];
    const nextCursor =
      page.length === data.limit && last && start + data.limit < ordered.length
        ? encodePackageCursor(String(last.name), String(last._id))
        : null;
    return { items, nextCursor };
  } catch (e) {
    reportPackageError(e, { userId, sessionUserId }, { action: 'listPackages' });
    throw e;
  }
}
```

- [ ] **Step 5: Correct the projection's comment**

`PACKAGE_SUMMARY_PROJECTION`'s docblock claims the arrays never cross the process boundary. They do — the store returns whole blobs. Replace that claim with:

```
 * This trims the SERVER-FN RESPONSE, and that is all it does. It is not a
 * memory control: the entity store keeps each document as one JSON blob, so
 * `items` and `moods` are fully materialised before this projection is
 * applied. What bounds this function's heap is the split visibility read
 * above, not this.
```

- [ ] **Step 6: Add the input schema**

In `app/types/schemas/soundboard.ts`, mirroring the audio list schema:

```ts
export const listPackagesSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});
```

- [ ] **Step 7: Update the route**

`app/routes/audio_.packages.tsx` calls `listPackages` and reads `{ items }`. Pass `{ limit: 50 }` and keep rendering `items`; wire `nextCursor` into the existing list UI only if it already has an append affordance — otherwise ignore it for now and leave a one-line comment saying the cursor is available.

- [ ] **Step 8: Run the tests**

```bash
npx vitest run --project unit tests/server/functions/packages.test.ts
npm run typecheck && npm run lint
```

Expected: all pass, clean.

- [ ] **Step 9: Commit**

```bash
git add app/server/functions/packages.ts app/types/schemas/soundboard.ts app/routes/audio_.packages.tsx tests/server/functions/packages.test.ts
git commit -m "perf(packages): split the visibility \$or into two pushed-down reads

The \$or was invisible to index pushdown, so listPackages scanned every
package in the install. Splitting it bounds the read to the caller's capped
set plus the system set. Adds a cursor for response size — not as a memory
control, which it cannot be.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Rewrite the E2E seed and teardown against the graph

**Files:**

- Modify: `e2e/globalSetup.ts` (`seedStorageQuotaFixtures`)
- Rewrite: `e2e/globalTeardown.ts`
- Modify: `playwright.config.ts` (already wires the teardown; verify only)

**Interfaces:**

- Consumes: `onceSourceBytes` from Task 1.
- Produces: seeded quota fixtures readable by `e2e/audio-hardening.spec.ts`.

- [ ] **Step 1: Retype the seeder's db handle**

`seedStorageQuotaFixtures` takes `db: NonNullable<typeof mongoose.connection.db>`. `dev`'s `globalSetup` already imports the graph shim; use it.

```ts
import { graphDb, ObjectId, type Db } from '../scripts/graph-db';
```

Change the parameter to `db: Db`. The function's `$setOnInsert` upsert needs no change — `graph-model.ts` implements `$setOnInsert` and `graphCollection.findOneAndUpdate` forwards `upsert`.

- [ ] **Step 2: Verify the seeded bytes actually land**

The fixture writes `onceSourceBytes`. Task 1 added the field, so it now persists — before Task 1 it would have been stripped, making the fixture under-count by 600 MB while still exceeding the 2 GiB default, i.e. passing for the wrong reason. Assert the total explicitly:

```ts
const seededTotal = AUDIO_QUOTA_FIXTURE.rows.reduce(
  (sum, r) => sum + r.sourceBytes + r.onceSource,
  0
);
if (seededTotal <= AUDIO_USER_QUOTA_BYTES_DEFAULT) {
  throw new Error(
    `Quota fixture seeds ${seededTotal} bytes, which does not exceed the default quota — ` +
      'the E2E would pass without proving anything.'
  );
}
```

- [ ] **Step 3: Rewrite the teardown**

```ts
import { AUDIO_QUOTA_FIXTURE } from './fixtures/audio-fixtures';
import { graphDb } from '../scripts/graph-db';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default async function globalTeardown(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env optional in CI when vars are set in the environment
  }

  // Without a graph URL `globalSetup` could not have seeded anything.
  if (!process.env.GREMLIN_URL) return;
  if (/prod/i.test(process.env.GREMLIN_URL)) {
    throw new Error('Refusing to use a production-looking GREMLIN_URL');
  }

  const { closeData } = await import('../app/server/db/data-runtime');
  try {
    await graphDb()
      .collection('audioassets')
      .deleteMany({
        // `sourceKey` is not an indexed slot, so this filters in process over
        // the collection. Acceptable for a teardown against a test database.
        sourceKey: { $regex: `^${escapeRegExp(AUDIO_QUOTA_FIXTURE.sourceKeyPrefix)}` },
      });
  } finally {
    await closeData();
  }
}
```

- [ ] **Step 4: Run the E2E**

```bash
npx playwright test e2e/audio-hardening.spec.ts --workers=1
```

Expected: PASS. If the quota spec fails with a credentials error rather than a refusal, the quota check is running _after_ an outbound R2 call — that is a real defect, not a test problem.

- [ ] **Step 5: Commit**

```bash
git add e2e/globalSetup.ts e2e/globalTeardown.ts
git commit -m "test(e2e): seed and tear down quota fixtures through the graph

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Fix the two scripts that still reference MongoDB

**Files:**

- Modify: `scripts/check-client-bundle.mjs`
- Modify: `scripts/dev-audio-worker.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces: a passing `npm run check:client-bundle`, which the branch adds as a CI job.

- [ ] **Step 1: Find a valid server-side positive control**

The script asserts `mongoose` appears under `.output/server` as its technique control — proof it is searching a populated bundle. That string is gone. **Do not guess a replacement**; measure one.

```bash
npm run build
grep -rl 'gremlin' .output/server | head -3
grep -rl 'gremlin' .output/public | head -3
```

Expected: matches under `.output/server`, **no** matches under `.output/public`. If `gremlin` appears in the client bundle, pick another server-only needle and re-run both greps — a control that is itself wrong makes a broken check look healthy.

- [ ] **Step 2: Apply the measured needle**

```js
const REQUIRED = [
  { dir: PUBLIC_DIR, needle: 'Storage limit reached', why: "AudioQuotaBar's client-side copy" },
  // Technique control: a string this script forbids on the client must be
  // present on the server, so a search that can never match anything cannot
  // masquerade as a pass. Was `mongoose` until the graph migration removed it.
  { dir: SERVER_DIR, needle: 'gremlin', why: 'server bundle sanity' },
];
```

Also replace `'mongoose'` in `FORBIDDEN_IN_CLIENT` with `'gremlin'` — it is now the string that must never reach the client.

- [ ] **Step 3: Run the check**

```bash
npm run check:client-bundle
```

Expected: PASS.

- [ ] **Step 4: Prove the check can fail**

Temporarily change the required needle to a string that cannot exist (e.g. `'zzz-not-present'`) and re-run. Expected: FAIL. Revert it. A positive control that has never been seen to fail is not a control.

- [ ] **Step 5: Fix the worker dev script**

In `scripts/dev-audio-worker.mjs`, replace both `MONGODB_URI` references with `GREMLIN_URL`:

```js
for (const name of ['GREMLIN_URL', 'R2_BUCKET']) {
  if (process.env[name]?.toLowerCase().includes('prod')) {
    fail(`refusing to run: ${name} looks like a production value.`);
  }
}
```

```js
const missing = [
  'GREMLIN_URL',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'CDN_URL',
].filter((name) => !process.env[name]);
```

- [ ] **Step 6: Commit**

```bash
git add scripts/check-client-bundle.mjs scripts/dev-audio-worker.mjs
git commit -m "fix(scripts): point the bundle guard and worker preflight at the graph

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Correct the comments and types that now assert something false

**Files:**

- Modify: `app/server/db/graph-driver.ts:140-146`
- Modify: `app/server/functions/audio.ts` (`sameObjectId`, the job-cap comment)
- Modify: `app/utils/audio-server-fns.ts`
- Modify: `app/lib/audio-rate-limits.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: nothing. Pure correction.

- [ ] **Step 1: Widen the `findOneAndUpdate` options type**

Every sibling method takes `Plain`; this one declares only two keys while forwarding the whole object. The worker's FIFO `sort` reaches runtime but is invisible to the type system, so a refactor that destructured the declared keys would silently turn the transcode queue from FIFO into arbitrary order — with no type error and no failing test.

```ts
    async findOneAndUpdate(
      filter: Plain,
      update: Plain,
      // `Plain`, not a two-key literal: `claimNext` passes `sort` through here
      // and the queue's FIFO ordering depends on it surviving.
      options: Plain = {}
    ) {
      return withObjectId(await model.findOneAndUpdate(filter, update, options).lean());
    },
```

- [ ] **Step 2: Add a test that pins FIFO ordering**

Without this, Step 1 is a comment. In `audio-worker/test/graph-store.test.ts`:

```ts
it('claims the oldest pending row first', async () => {
  await seed({ _id: newer, status: 'pending', createdAt: new Date('2026-01-02') });
  await seed({ _id: older, status: 'pending', createdAt: new Date('2026-01-01') });
  const claimed = await claimNext(model, 'worker-1');
  expect(String(claimed?._id)).toBe(String(older));
});
```

- [ ] **Step 3: Correct `sameObjectId`'s premise**

Its comment says Mongo's ObjectId cast is case-insensitive. Here `objectIdString` is `/^[0-9a-f]{24}$/` — lowercase only — so an upper-cased id simply misses. That is fail-closed and safe, and the boundary schema lowercases anyway, but the comment must stop claiming otherwise.

```ts
// Ids are lowercase 24-hex strings (`objectIdString`), and the request schema
// lowercases at the boundary, so this is a plain comparison. It used to lean on
// Mongo's case-insensitive ObjectId cast, which no longer exists: an
// upper-cased id now misses rather than matching.
```

- [ ] **Step 4: Correct the job-cap overshoot figure**

The comment says two concurrent requests land a user "one job over the cap". With N in-flight the overshoot is up to N−1. The conclusion is unchanged.

```
// Racy by construction, and deliberately so: the count and the enqueueing
// write are two calls, and this layer has no multi-document transaction to
// make them one. N concurrent confirms from one user can all read
// `count == max - 1`, landing them up to N-1 over the cap. The ingest limiter
// bounds N in practice. Closing it properly needs a per-user counter document
// CAS'd with `{$lt: max}` plus a decrement on completion — more machinery than
// a 20-job fairness knob is worth.
```

- [ ] **Step 5: Fix the stale prose in the server-fn wrappers**

`app/utils/audio-server-fns.ts` describes `AudioAsset.ownerId` as a Mongoose `ObjectId` ref to `'User'`. It is a 24-hex string, and there is no `User` model. Correct that line and the similar mongoose mentions in `app/lib/audio-rate-limits.ts`.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint
(cd audio-worker && npm run typecheck && npm test)
git add -A
git commit -m "docs(audio): correct comments and types that still assert mongo semantics

Widens graph-driver's findOneAndUpdate options to Plain so the worker's FIFO
sort is visible to the type system, and pins that ordering with a test.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Run the full gate and update the PR

**Files:** none modified unless the gate fails.

**Interfaces:**

- Consumes: every preceding task.
- Produces: a mergeable PR #548.

- [ ] **Step 1: Run the complete gate**

Run each directly and read its output — do not take a prior task's word for it.

```bash
npm run build
npm run check:client-bundle
npm run typecheck
npm run lint
npm test
npm run test:storybook
bash deploy/charts/cartyx/tests/render-tests.sh
(cd audio-worker && npm run typecheck && npm test)
(cd realtime && npm run typecheck && npm test)
npx playwright test --workers=1
```

- [ ] **Step 2: Record the actual results**

For each command, note pass/fail and the counts. If anything fails, fix it before proceeding — do not describe the branch as green on the strength of an earlier task's local run.

- [ ] **Step 3: Push and update the PR body**

```bash
git push origin audio-hardening
```

Update PR #548's description: the `Beyond the plan` table's Mongo references, the "no migration is required" claim (still true, now because Zod defaults backfill at parse), and add a short section linking the port design doc and naming the three redesigned controls.

- [ ] **Step 4: Confirm CI is green**

```bash
gh pr checks 548
```

Expected: all jobs pass. The previous `npm audit` failure came from a stale lockfile and should be resolved by the merge bringing `dev`'s refreshed dependencies.

---

## Self-Review

**Spec coverage.** Quota rewrite → Task 3. `listPackages` memory + cursor → Task 6. Visibility `$or` → Tasks 5 and 6. `$unset`/ordering defect → Task 4. Silent-strip trap → Tasks 1 and 2. Model translation → Task 1. Mechanical substitutions → Tasks 7 and 8. Comment/type corrections → Task 9. Testing requirements (round-trip proof, reaper ordering test, fail-closed test, E2E before-R2 assertion) → Tasks 2, 4, 3 and 7 respectively.

**Known gap, deliberate.** The spec's follow-ups are explicitly not blocking and are not tasked: `checkOrThrow` extraction, the test-only limiter reset, phase 3's REST adapter, and the >12-CAS-retry load test.

**Type consistency.** `getUserStorageUsage(userId: string)` keeps its signature across Tasks 3 and 7. `listPackages` changes shape once, in Task 6, and Task 6 updates its only caller. `sourceKey` becomes nullable in Task 1 and is consumed in Task 4. `encodePackageCursor`/`decodePackageCursor` are defined and used only in Task 6.
