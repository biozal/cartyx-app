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

What changes is the cost argument. The original justified the query as "one
`$group` served by the `{ownerId, createdAt}` index". Now it materialises the
user's own rows. That is bounded by the quota itself — at the 2 GiB default and
~126 MB per asset, roughly 16 rows — so the cost is acceptable, but the reasoning
in the code comment must be rewritten rather than carried over. A comment that
justifies a design with a premise that is no longer true is worse than no
comment; it reads exactly like a true one to whoever builds the next guard on it.

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

**Redesign:** bound the number of documents, since that is the only lever the
storage model leaves. `listPackages` gains a limit and a cursor, following the
idiom `listAudioAssets` already uses rather than inventing a second one. The
projection stays as a payload-shrinker, with its comment corrected to say what it
now does.

### Visibility filtering on `ownerId: null`

`packageVisibilityFilter` is `$or: [{ ownerId: userId }, { ownerId: null }]` —
your packages plus the system ones. Two independent reasons it no longer narrows:
pushdown only considers top-level keys present in the `index` map, so anything
inside `$or` is invisible to it (`graph-model.ts:335-337`); and a null index value
is deliberately stored as an _absent_ property, precisely "so `has` cannot match
it" (`graph-entity-store.ts:179`). The result is a full `audiopackages` scan
on four call paths, degrading with total install size rather than with the caller.

**Redesign, in two parts:**

1. **Teach the store to query an absent index slot.** A `null` in a `where`
   clause translates to `hasNot(slot)` instead of `has(slot, null)`. This is a
   small, general addition that matches the store's existing model of null — it
   already writes null as a property drop, so reading it back as `hasNot` closes
   a gap rather than introducing a new concept. Every model gains it.
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
- `sameObjectId`'s premise — that Mongo's ObjectId cast is case-insensitive — is
  false here: `objectIdString` is lowercase-only, so an upper-cased id misses.
  That is fail-closed and safe, and the boundary schema normalises to lowercase
  anyway, but the comment must stop claiming otherwise.
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
