# Audio Hardening — JanusGraph Port (Design)

**Date:** 2026-09-22
**Status:** Approved (design), pending implementation plan
**Ports:** [PR #548](https://github.com/biozal/cartyx-app/pull/548) — [design](./2026-07-31-audio-hardening-design.md) · [plan](./2026-07-31-audio-hardening-plan.md) · [review fixes](./2026-09-07-audio-review-fixes.md)
**Depends on:** the Mongo → JanusGraph migration ([plan](./2026-09-07-janusgraph-cassandra-migration-plan.md)), landed on `dev` 2026-09-13 → 2026-09-19

## Summary

PR #548 closes the abuse surface on audio ingest and packages — rate limits, a
per-user storage quota, and a bound on transcode-queue occupancy. It was written
in August against Mongoose. MongoDB was removed from `dev` in September.

This design covers what it takes to land that branch on the graph stack. It is a
port, not a redesign: every control keeps its original shape and rationale. Three
things could not be ported as written and are redesigned here, each because a
MongoDB capability the original leaned on has no graph equivalent.

## What the investigation found

Three facts set the scope, and two of them are better news than the diff suggests.

**`dev` barely touched this feature.** Only 4 of the 88 commits since the
merge-base reach the audio paths, and all four are migration mechanics. Every
audio _logic_ file — `audio.ts`, `packages.ts`, `soundboard.ts`,
`useSoundboard.ts`, `engine.ts`, and the worker's `claim.ts`/`process.ts` — is
**byte-identical to the merge-base**. There is no competing work to reconcile,
which is why an 81-file branch produces only 7 conflicting files and 7 hunks.

**None of the six robustness fixes were fixed independently.** The unbounded
decoded-buffer cache, the un-aborted in-flight loads, the once-reaper gating on
`updatedAt` — all still live on `dev`. The branch's value is fully intact.

**The atomicity the design rests on survived.** PR #548 states that `claimNext`
"is a single atomic `findOneAndUpdate` that nothing in three phases has broken".
That is still true. `findOneAndUpdate` on the graph layer is a genuine
compare-and-set: the filter is re-tested inside the mutator against the exact
version the write commits (`graph-model.ts:450-456`), inside a revision-fenced
JanusGraph transaction whose revision key is declared `ConsistencyModifier.LOCK`
(`scripts/graph/0002-entities.groovy:56-62`), with bounded retry. A contract test
exercises precisely a queue claim — four racers take four distinct slots
(`tests/contracts/graph-model.contract.ts:183-208`) — and runs against real
JanusGraph in CI.

So **package optimistic concurrency and the worker claim port unchanged.** The
per-user job cap remains racy, exactly as the branch already admits, with one
correction recorded below.

## What cannot be ported as written

### The storage quota's aggregation

`audio-quota.ts` imports `mongoose` and runs a `$group` / `$add` / `$ifNull`
pipeline. `defineGraphModel` exposes no `aggregate()`, by design.

**Redesign:** read the caller's own assets with a filter that pushes down on the
`ownerId` index and sum the six byte-bearing fields in process. The document is
stored as a single JSON blob, so a projection saves no I/O (see below) — the
honest implementation reads the rows and adds them up.

This preserves every property the original argued for. It still counts every
status, not just `ready`. It still **fails closed**: an aggregation that throws
refuses the upload, because an unmeasurable quota that admits the request is not
a quota. The `$ifNull` guards become ordinary nullish-coalescing on each of the
six paths, which is what they always meant.

What changes is the cost argument, and it does not resolve to "bounded". The
original justified the query as "one `$group` served by the `{ownerId,
createdAt}` index". Now it materialises the user's own rows, and **row count is
not bounded by the quota at all** — dividing 2 GiB by ~126 MB (a maxed asset's
footprint) gives the MINIMUM row count consistent with being at the quota, not
a maximum; row count is maximised by small or zero-byte rows. Decisively,
`createAudioUpload` mints an `AudioAsset` row at presign time with
`sourceBytes: null`, which contributes 0 to the sum, so the quota can never
refuse it. If the upload is abandoned, `reapAbandonedUploads`
(`audio-worker/src/claim.ts`) fails the row and deletes its R2 object but never
deletes the row — nothing does — and there is no per-user asset-count cap
anywhere in this repo. So an account can accumulate an unbounded number of
zero-byte `failed` rows, and `getUserStorageUsage` reads every one of them, in
full, on every presign, every confirm, and every `/audio` page load. The Mongo
`$group` this replaced returned one row to the pod regardless of cardinality,
so this is a real regression the port introduces, not merely a reworded cost
argument. The code comment must say this rather than the "roughly 16 rows"
claim it used to carry, and the real fix is tracked as a Follow-up below.

### The `listPackages` memory guard

`PACKAGE_SUMMARY_PROJECTION` computes `itemCount`/`moodCount` with
`$size`/`$ifNull` so the `items` and `moods` arrays never cross the process
boundary. It was added to prevent an OOMKill on a 512Mi pod.

**It cannot work here, and no rewriting of it can.** The entity store persists
each document as a single `doc` property holding serialized JSON
(`graph-entity-store.ts:121-124`), read back whole and `safeParse`d. There is no
partial read of a blob. `matching()` materialises every candidate document before
mingo filters or projects it (`graph-model.ts:324-354`). The projection still
shrinks the server-fn _response_, which is worth keeping, but the peak-heap risk
it was introduced to remove is back.

**A cursor does not fix it either.** `matching()` reads through
`collection.findAll`, which is typed `Omit<FindOptions<T>, 'limit' | 'offset'>`
and loops every store page into one array (`collection.ts:257-265`); `find()`
then applies `page(found, skip, limit)` in process (`graph-model.ts:552-558`).
So `.limit()` bounds the **response**, never the read. Shipping a cursor as an
OOM control would repeat the mistake this document exists to avoid.

**What actually bounds peak heap is the `where` clause**, because that is the
only thing that decides how many documents `findAll` accumulates. So the memory
fix _is_ the visibility-filter fix below: splitting the `$or` into two
pushed-down arms turns "every package in the install" into "the caller's own,
already capped at `MAX_PACKAGES_PER_USER`, plus the curated system set". One
change closes both problems.

**Redesign:** split the `$or` (below) for the memory bound. `listPackages` also
gains a limit and a cursor, following the idiom `listAudioAssets` already uses —
but **for response size and incremental rendering, not as a memory control**, and
its comment must say so. The projection likewise stays as a payload-shrinker,
with its own comment corrected to claim only that.

### Visibility filtering on `ownerId: null`

`packageVisibilityFilter` is `$or: [{ ownerId: userId }, { ownerId: null }]` —
your packages plus the system ones. Two independent reasons it no longer narrows:
pushdown only considers top-level keys present in the `index` map, so anything
inside `$or` is invisible to it (`graph-model.ts:335-337`); and a null index value
is deliberately stored as an _absent_ property, precisely "so `has` cannot match
it" (`graph-entity-store.ts:179`). The result is a full `audiopackages` scan,
degrading with total install size rather than with the caller.

**Only `listPackages` is affected.** The filter has four call sites, but
`getPackage`, `listPackageAssets` and `clonePackage` all AND it with
`_id: data.id`, and `matching()` short-circuits a string `_id` to a single
`collection.get(id)` (`graph-model.ts:328-330`) before any index pushdown is
considered. Those three narrow to one document and evaluate the `$or` in
process, which is correct and cheap. `listPackages` is the only caller with no
`_id`, and therefore the only one that scans.

**Redesign, in two parts:**

1. **Teach the store to query an absent index slot.** A `null` in a `where`
   clause translates to `hasNot(slot)` instead of `has(slot, null)`. This is a
   small, general addition that matches the store's existing model of null — it
   already writes null as a property drop, so reading it back as `hasNot` closes
   a gap rather than introducing a new concept. Every model gains it.

   **What this buys is narrower than it sounds.** The composite indexes here
   are `(scope, kind)` and `(scope, kind, ix_sN)`
   (`scripts/graph/0002-entities.groovy`), and a composite index requires
   EQUALITY on every one of its keys. `hasNot('ix_s1')` supplies no equality
   value for `ix_s1`, so JanusGraph's planner cannot use the three-key index
   for it and falls back to `(scope, kind)`, then walks every vertex of that
   kind testing absence one at a time. So `hasNot` narrows the RESULT SET
   inside the graph, not the SCAN — it is O(kind), not O(matches). The outcome
   the split was bought for still holds regardless: Gremlin filters before
   `project()`, so only matching documents are ever materialised and shipped
   to the web pod, where the unfiltered `$or` form materialised everything.
   That memory bound is real. What is not true is that `hasNot` is index-served
   the way `has(slot, value)` is — the next model to write `find({ x: null })`
   should not expect this to be cheap in the way an equality lookup is.

2. **Split the disjunction into two pushed-down queries**, merged in process.
   Both arms then narrow in the graph. This is deliberately preferred over
   teaching the pushdown layer to translate `$or` into a `union()` traversal,
   which is a substantially larger change to shared infrastructure for one
   call site's benefit.

Rejected: giving system packages a sentinel `ownerId`. It needs a data migration
and makes "system package" a magic value rather than an absence, which is what it
actually is.

## The defect the migration created

`reapRejectedUploads` (new on the branch) does
`$unset: { sourceKey: '' }` — `audio-worker/src/claim.ts:325`. On `dev`,
`sourceKey` is `z.string()`: required, not nullable. Every single-document update
runs `schema.parse` inside the CAS mutator (`graph-model.ts:453`), so the unset
raises a `ZodError`.

The throw alone would be tolerable. What makes it serious is the ordering: the
reaper calls `deleteSource(...)` for the whole batch _before_ any fenced write,
and the error lands in a `catch` after the R2 objects are already gone. The rows'
`sourceKey` never clears, so every subsequent pass re-lists them, re-issues
`DeleteObjects` for already-deleted keys, throws again, and files another
GlitchTip event. Permanently.

**Two fixes, both required:**

- **Make `sourceKey` nullable** (`z.string().nullable()`) and clear it with
  `$set: { sourceKey: null }`. This matches how every sibling field —
  `onceSourceKey`, `sourceBytes` — is already declared. It also makes the
  reaper's idempotency predicate meaningful: `sourceKey: { $type: 'string' }` is
  currently always true against a required field and can never distinguish an
  already-reclaimed row. It becomes `{ $ne: null }`.
- **Invert the ordering** so the fenced `updateOne` runs first and only a matched
  write authorises the R2 delete. This is not a new rule; it is the rule the rest
  of `claim.ts` is explicitly built around, stated in its own comments, and
  followed by both sibling reapers. `reapRejectedUploads` is the only place that
  inverts it.

Making `sourceKey` nullable touches a shared model field, so the implementation
must check every reader — the plan will enumerate them rather than assume.

## The silent-failure trap

`onceSourceBytes` and `onceUploadStartedAt` are two fields the branch adds to
`AudioAsset` and `$set`s in nine places across the app, the worker and the E2E
seed.

Zod strips unknown keys. Because `parse` runs on every create and every update,
a `$set` naming a field the schema does not declare is **silently discarded** —
no throw, no log, nothing. If the model conflict is resolved by taking `dev`'s
Zod schema without re-adding these two fields, then:

- the storage quota never sees once-source bytes, which is the entire point of
  the field; and
- `reapAbandonedOnceUploads` always falls through to its `updatedAt` branch, so
  the once-reaper bug the branch exists to fix is not fixed.

Both failures are invisible to the unit suite, because per-method model mocks
return whatever they were told regardless of what the write actually contained —
the exact hazard `CLAUDE.md` documents. This is a consequence of the model port,
not an independent bug, but it is the one that fails quietly, so the plan treats
"the field round-trips through a real write" as its own verification step against
the in-memory entity store rather than a mock.

## Architecture of the port

### Model layer

Both model files arrive as whole Mongoose schemas and must be re-expressed
against `dev`'s `defineGraphModel`. Mechanically:

| Mongoose                                      | Graph                                      |
| --------------------------------------------- | ------------------------------------------ |
| `{ type: Number, default: null }`             | `z.number().nullable().default(null)`      |
| `{ type: Date, default: null }`               | `z.coerce.date().nullable().default(null)` |
| `mongoose.Schema.Types.ObjectId, ref: 'User'` | `objectId` from `schema-parts.ts`          |
| `schema.index({ field: 1 })`                  | an entry in the declarative `index:` map   |
| conditional `required: function () {...}`     | no equivalent — becomes nullable           |

Two notes the implementation must respect. Index slots are a fixed typed list;
`onceUploadStartedAt` is filtered on by the reaper, so it needs a date slot, and
`ix_d2` is free on `AudioAsset`. And a new field carrying a `.default()` needs no
version bump, because the default backfills at parse — which is what makes this
migration-free, the same property the original design claimed via `$ifNull`.

`tests/server/db/audio-asset-model.test.ts` was deleted on `dev` and replaced by
`audio-model-schemas.test.ts`. The branch's version is rewritten into the new
file's style, not merged.

### Everything else

The remaining work is mechanical substitution, listed here so the plan can
enumerate it: `e2e/globalTeardown.ts` is a new file written entirely against
mongoose and is rewritten against the `scripts/graph-db.ts` shim and `closeData()`;
`e2e/globalSetup.ts`'s new seeder needs its `db` parameter retyped (its
`$setOnInsert` upsert is already supported and stays); `scripts/dev-audio-worker.mjs`
gates on `MONGODB_URI` and must gate on `GREMLIN_URL`; and two test files mock
mongoose, which no longer resolves.

`scripts/check-client-bundle.mjs` deserves its own mention. Its positive control
asserts that `mongoose` appears in the server bundle — the check that proves the
script is searching a real bundle rather than passing vacuously. With mongoose
gone the control is unsatisfiable and the new CI gate fails. It needs a different
needle that is genuinely present server-side and genuinely absent client-side.
The control must be re-verified, not merely swapped: a positive control that is
itself wrong is worse than none, since it makes a broken check look healthy.

### Corrections carried by the port

Small, but each is a comment or type that now asserts something false:

- `graph-driver.ts:140-146` types `findOneAndUpdate`'s options as
  `{ returnDocument?, upsert? }` while every sibling takes `Plain`. The worker's
  FIFO `sort` is forwarded at runtime but invisible to the type system. A
  refactor that destructured only the declared keys would silently turn the
  transcode queue from FIFO into arbitrary order, with no type error and no
  failing test. Widen the type.
- `sameObjectId`'s premise — that Mongo's ObjectId cast is case-insensitive —
  is stale, but its actual behaviour is unchanged: the function unconditionally
  lowercases both operands itself, so an upper-cased id still matches, never
  misses. Its `.toLowerCase()` calls are load-bearing for a caller that doesn't
  route through `~/types/schemas/audio.ts`'s `objectId` (which normalises
  case) — not redundant with the stored-id-only `objectIdString`.
- The job-cap comment says two concurrent requests land a user "one job over the
  cap". Under N in-flight requests the overshoot is up to N−1. The conclusion is
  unchanged — a hard cap needs a CAS'd counter document and is not worth it for a
  20-job fairness knob — but the number should be right.
- `audio-server-fns.ts` describes `AudioAsset.ownerId` as a Mongoose ObjectId
  ref. It is a 24-hex string.

## Failure modes

The original design's failure-mode table stands. Three entries change:

| Failure                          | Handling                                                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quota aggregation fails          | Unchanged — **fail closed**, refuse the upload. The read is a `find` rather than a pipeline; the catch and the refusal are the same.                                                                                                                           |
| Web pod restarts                 | In-process buckets reset. Accepted; the durable controls are now **graph**-backed, not Mongo-backed.                                                                                                                                                           |
| Heavy contention on one document | New. `mutate` exhausts 12 CAS attempts and throws `StaleRevisionError` rather than returning `null`, so a package save under extreme contention surfaces as a 500 instead of the editor's conflict notice. Unlikely for a package editor; recorded, not fixed. |

## Testing

The original testing strategy holds, with two additions that come directly from
what the investigation found.

**Writes must be proven against a real model, not a mock.** The two new schema
fields fail silently under per-method mocks. At least one test per field drives a
real graph model over the in-memory entity store (`entityStoreDouble`) and asserts
the value survives a round trip. This is the documented pattern for exactly this
class of bug.

**The reject-reaper needs an ordering test.** Assert that a row whose state
changes between the list and the write is _not_ deleted from R2 — which is the
property the inverted ordering was violating, and the one a green test suite
missed entirely.

Beyond that: the limiter stays pure and exhaustively tested; every scoped-count
test keeps asserting the actual filter argument; the fail-closed path keeps its
own test; and the E2E still proves the quota refusal happens before any outbound
R2 call, which is what makes it distinguishable from a credentials failure under
CI's deliberately fake R2 credentials.

Worker changes now bundle app modules through esbuild, so `(cd audio-worker && npm
run typecheck && npm test)` is required, and any new app module the worker reaches
must be inside `Dockerfile.dockerignore`'s whitelist or the image build fails.

## Rollout

Merge `dev` into `audio-hardening` and fix forward, keeping PR #548 and its review
history. The merge is small — 7 files — and there is no competing work to replay,
which is what makes rebasing 43 commits across a data-layer change the wrong
trade.

Promotion remains the branch's stated definition of done: `dev` → `main` should
stop being a knowingly bad idea. Nothing here changes that bar.

## Follow-ups (not blocking)

Carried from the original, still true:

- Extract `checkOrThrow(limiter, key, action)`; the gate block is duplicated ten times.
- Add a test-only limiter reset — `packageWriteLimiter` is a shared bucket that
  will bite a future test author confusingly.
- Phase 3's REST adapter calls the server functions directly, bypassing the rate
  limiter (quota and job cap still apply), and flattens refusals into a generic 500.

New, from this investigation:

- The `{ownerId, status}` index the original wanted for the job-cap count is now
  an index-slot decision rather than a compound index; `status` is already
  indexed, so the count narrows on one term and filters the rest in process.
- `bulkWrite` has no cross-document atomicity on this layer and says so. Nothing
  in this branch depends on it, but the packages code is the likeliest future
  caller.
- Load behaviour past 12 CAS retries on a single hot document is untested. The
  `repositories-integration.ts` harness is where that would go.
- **`getUserStorageUsage`'s row count is unbounded** (see "The storage quota's
  aggregation" above). A presign-only `AudioAsset` row (`sourceBytes: null`)
  contributes zero bytes and is never reaped once `reapAbandonedUploads` fails
  it, so an account can accumulate arbitrarily many rows this function still
  reads in full on every presign, confirm, and `/audio` page load. Real
  options: a per-user asset-count cap (mirroring `MAX_PACKAGES_PER_USER`), a
  store-side count/sum primitive, or having the abandoned-upload reaper delete
  the row instead of only failing it. This should be closed before the
  `dev` → `main` promotion.
- **`PACKAGE_LIST_PAGE_SIZE`'s truncation is silent.** `listPackages` sorts the
  union of the caller's own packages and the system catalogue by name and then
  truncates to `PACKAGE_LIST_PAGE_SIZE`. Today that is safe because the system
  catalogue is empty, but the moment it exceeds
  `PACKAGE_LIST_PAGE_SIZE - MAX_PACKAGES_PER_USER`, truncation drops whatever
  sorts last alphabetically — not "the system extras" — which will routinely
  include some of the caller's OWN packages, silently, on the one page where
  they can delete them. Recommended fix: a `serverCaptureEvent` when
  `listPackages` returns a non-null `nextCursor`, so the day this starts
  truncating is visible before a user reports missing packages. Not
  implemented in this PR.
