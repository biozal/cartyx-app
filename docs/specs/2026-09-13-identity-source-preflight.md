# Identity/access source preflight

This is the first source-data rehearsal for migration phases 4–5. It exports and
audits `users` and `campaigns` read-only. Every application subsystem still uses
MongoDB; no graph import, account repair, credential rotation or backend switch
is included. Continue application work on draft PR #557 against `dev`.

## Run and verify

Provide `MONGODB_URI` through the operator's private environment, never a command
argument. `MONGODB_DB` explicitly overrides the URI database when needed. The
`local|dev|prod` argument labels the evidence; it does **not** select or authenticate
an environment. Check the intended source configuration first. Do not load the
application bootstrap or models to perform the export.

```sh
npm run identity:archive -- export dev
npm run identity:archive -- verify .local/data/identity/dev-<generated-suffix>
npm run identity:test
```

The CLI prints counts and a private directory path, never document values or
driver errors. Exit 0 means artifact integrity verified; finding counts can still
require review. It is not a cutover readiness signal. Failures exit 1. Inspect
`audit.json` privately for findings and observed field types. Unsupported snapshot
reads, missing collections, observed catalog drift and resource limits fail closed.
An empty existing collection is valid. No collection is created on the source.

Use a MongoDB `read` account on the intended database where available. The
exporter only lists collection/index metadata, performs snapshot finds/getMore/count aggregates,
and manages driver sessions/cursors. It never runs a write or imports an app model.
There is no silent fallback to ordinary reads and no automatic query retry.

## Archive contract

Each run creates a new private directory under ignored `.local/data/identity`.
Directories are mode 0700; files are 0600. Source BSON includes PII and encrypted
OAuth material: keep the entire archive private, including catalog and field paths.
Permissions provide local access control, **not encryption**. Do not commit,
upload as CI artifacts or place in shared storage. Existing OAuth encryption keys,
JWT signing configuration and R2 objects are outside this archive and must be
preserved separately for an actual migration.

- `users.bson`, `campaigns.bson`: original raw BSON documents concatenated in cursor
  order, with standard BSON length framing. No projection, serialization roundtrip,
  normalization, default insertion or token decryption. Unknown fields, subdocument
  IDs, ObjectIds, dates, numeric widths, binary subtypes, null/missing and array order
  survive. There is no stable ordering guarantee between separate exports.
- Both cursors share one snapshot session. The manifest records the server-selected
  `atClusterTime`. A concurrent write cannot move the second collection to a newer
  snapshot. Snapshot history expiration requires a fresh export, never a resume into
  the old directory. See MongoDB's [snapshot read concern](https://www.mongodb.com/docs/manual/reference/read-concern-snapshot/)
  and the driver's [raw BSON option](https://mongodb.github.io/node-mongodb-native/7.0/interfaces/FindOptions.html#raw).
- `catalog.json`: canonical Extended JSON collection options/UUIDs and actual index
  definitions, captured before/after the document reads. Catalog commands cannot
  share this snapshot. The exporter rejects observed changes; a change-and-revert
  can escape that comparison. The manifest explicitly labels catalog consistency
  `live-before-and-after-not-snapshot`. An eventual cutover still needs a schema/write
  freeze and a restorable whole-source backup appropriate to the Atlas tier.
- `audit.json`: counts, fixed finding categories and field paths/types/occurrences.
  Path segments are literal keys, with JSON `null` denoting an array element; this
  avoids collisions with keys containing dots or `[]`. Occurrences inside arrays
  count elements, not parent documents. Values and record IDs are never copied into
  this report. Malformed/legacy records remain untouched in the BSON files.
- `manifest.json`: format version, source label/database, capture time, snapshot,
  per-file SHA-256/byte counts and per-collection document counts, cross-checked
  against counts from the same source snapshot. Published last via
  rename from `manifest.pending`. A failed/interrupted run lacks a usable completion
  marker. Discard incomplete directories privately and restart with a new snapshot.

Verification is offline/read-only. It validates ownership/private permissions,
rejects symlink files and paths supplied by a manifest, parses every BSON frame,
checks all hashes/counts, and independently rebuilds the audit. Hashes detect
corruption, not malicious replacement of both data and manifest. This format has
no signature or external root of trust. Do not edit artifacts while verifying.

Limits are 16 MiB per document/JSON metadata file, 1 GiB and 100,000 documents per
collection, nesting depth 100 and five million audited field visits. BSON is
streamed; the audit retains identity/reference/uniqueness sets in memory. These are
deliberate bounds for the identity slice, not a general large-database exporter.
Connection/selection limits are 10 seconds, socket inactivity/find execution
limits 30 seconds; there is no single end-to-end deadline.

## Identity behavior to preserve in the next slice

| Source contract                                                        | Migration requirement                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User._id` and campaign/member ObjectIds                               | Keep the existing ID as `entityId`; do not expose JanusGraph's internal ID.                                                                                                                                                                                            |
| OAuth profile/session `id` matches `User.providerId`                   | Preserve the current provider-prefixed identity string and JWT claims. It is distinct from the Mongo user ID.                                                                                                                                                          |
| Global sparse unique `providerId`, `email`, `audioStoragePrefix`       | Missing differs from explicit null. Preserve exact values; do not change to provider-plus-ID uniqueness or normalize email implicitly. Audit flags duplicate exact scalar/null values. Actual index collation/partial/multikey semantics still require catalog review. |
| First login claims an email-only account before creating a new account | Preserve the existing account, memberships and media namespace. Design conditional identity reservations and interrupted-operation recovery before moving this path.                                                                                                   |
| `oauthTokens` hidden by Mongoose, optional/null encrypted envelopes    | Preserve ciphertext, IV and authentication tag verbatim. Continue explicit server-only access and existing decryption/revocation behavior. Shape checks do not prove decryptability.                                                                                   |
| Optional immutable 32-character `audioStoragePrefix`                   | Preserve it exactly; do not backfill or regenerate. Retain preferences, names, timestamps and unknown fields until mappings are reviewed.                                                                                                                              |
| `Campaign.members`, `gameMasterId`, duplicated `User.campaigns`        | Keep campaign access on an explicit Mongo adapter through the identity cutover. Resolve membership discrepancies with domain rules; never infer permission from the audit or a stale graph projection.                                                                 |

The audit flags invalid ObjectId references, unknown account/member roles,
duplicate/orphan links, malformed token envelopes/media prefixes, missing mirrored
membership and a GM absent from the campaign's GM membership. The last two can
represent legacy data accepted by current access helpers; they are review findings,
not instructions to revoke or manufacture membership. Other collections, reverse
references into users, invite capacity, authorization parity, all schema validators,
token decryption and account repair are outside this audit. BSON duplicate field
names are not independently audited; the raw bytes remain preserved.

## Evidence — September 13, 2026

Read-only exports using the live `dev` and `prod` application Mongo configurations
completed and passed independent archive verification:

| Environment | Users | Campaigns | Finding categories |
| ----------- | ----: | --------: | -----------------: |
| dev         |     8 |         3 |                  0 |
| prod        |     2 |         0 |                  0 |

Private archives remain in the integration checkout's `.local/data/identity`.
These counts and zero findings only describe this audit's checks at capture time.
They are not evidence that import, restore, login concurrency or access parity is
ready. Nothing in either Atlas database was changed.

Local Docker MongoDB 7.0.41 passed authenticated read-only export (including denied
fixture writes), byte-for-byte BSON comparison with hidden/legacy fields, multiple
cursor batches, a concurrent-write snapshot contract, empty collections, incomplete
export rejection and standalone snapshot refusal. Unit tests cover corruption,
truncation, oversized framing, manifest path/count/hash/audit changes and private
permissions/symlinks. CI runs the fixture against pinned MongoDB 7 and 8 images.

`IDENTITY_TEST_MONGO_VERSION=8 npm run identity:test` selects the MongoDB 8 fixture;
7 is the default. MongoDB 8's current image refuses this laptop's Docker Desktop
7.0.12 kernel due to its allocator startup check; 8 testing runs on Ubuntu CI.
No kernel checks or allocator safety checks are bypassed. See the upstream
[MongoDB startup check](https://github.com/mongodb/mongo/blob/v8.0/src/mongo/db/startup_check_rseq.cpp).
The fixture creates its own loopback-only container, random credentials and
synthetic data, and removes its container/volumes and temporary artifacts. It
ignores application `MONGODB_URI` and accepts no server/database write target.

Next: implement the identity repository contract and Mongo adapter, preserving
current login/account-claim and campaign-access behavior behind contract tests.
Then define reservations/recovery and implement the graph/CQL adapter, importer and
dev rehearsal. Runtime Gremlin authorization and the remaining phase-4 gates stay
open; this preflight does not authorize a backend cutover.
