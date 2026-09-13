# Identity import mapping and recovery rehearsal

PR #557 now includes an inactive, create-only account importer that composes exact
identifier reservations, JanusGraph profile publication and Cassandra account
creation. It supports bound accounts with their original encrypted token envelopes,
and unbound accounts without manufacturing a provider or media namespace. MongoDB
still serves every application subsystem. No source account has been imported into
dev or production target storage.

## Offline source check

```sh
npm run identity:import-check -- .local/data/identity/<private-archive>
```

The command verifies the entire original [BSON archive](2026-09-13-identity-source-preflight.md)
and checks each user against the supported target projection. It prints fixed
categories/counts only, exits 1 for mapping blockers or source audit findings, and
always reports `cutoverReady: false`. It does not load database configuration,
connect to a database, persist import plans, decrypt tokens or repair the archive.
Provisional mappings are discarded; archive hash/count/audit failure invalidates
the whole check, even if some frames were individually mappable.

The mapper preserves canonical user IDs, exact provider/email strings, encrypted
token strings, media prefixes, profile names/avatar/role/preferences and supported
timestamps. It does not insert Mongoose defaults or generate an audio namespace.
It rejects unknown fields, incomplete provider bindings, malformed token envelopes,
explicit null sparse-unique identifiers, incompatible types, target size bounds
and BSON that fails a byte-for-byte deserialize/serialize round trip. The latter
conservatively refuses duplicate fields and unusual encodings rather than silently
selecting one value. Base64/shape validation is not a decryption test.

Original BSON remains mandatory preservation evidence. The runtime projection
uses null for absent optional profile values; it does not preserve missing-versus-null
or source BSON type widths. `campaigns`, `__v`, and legacy `updatedAt` are explicitly
retained in the original archive, not copied into an invented profile field.
Campaign membership/mirrors remain Mongo-owned. Unknown fields elsewhere, including
inside preferences or token envelopes, block mapping. Other legacy fields must be
reviewed before expanding this allowlist. No archive may be discarded on the
strength of this projection check.

September 13 offline evidence from the existing private snapshots:

| Source | Users checked | Supported projections | Mapping blockers | Source finding categories |
| ------ | ------------: | --------------------: | ---------------: | ------------------------: |
| dev    |             8 |                     8 |                0 |                         0 |
| prod   |             2 |                     2 |                0 |                         0 |

Four dev users contain legacy `updatedAt` dates absent from the current User model.
All eight dev and two prod users retain campaign mirror arrays in their archive;
three dev and two prod users also retain `__v`. This is evidence about the captured
snapshots, not current source equality or readiness to retire Mongo.

## Operator import protocol

`scripts/identity/import-account.ts` exposes `createIdentityImporter(state, graph)`
for trusted operator code and synthetic tests. There is deliberately no real-data
apply CLI yet. A future bulk runner must verify a frozen archive, bind a durable
manifest to the intended environment/keyspace/graph endpoint, retain each exact
plan privately **before** invoking the importer, and reconcile all accounts and
references before cutover. The source mapper generates fresh operation/revision
IDs; re-running it is not a way to resume a previously started import.

A plan contains the source frame SHA-256, original user ID, three distinct operation
UUIDs, profile revision ID, target profile content and account creation command.
The complete plan is validated and bounded before any target access. Its IDs and
content cannot change on replay. The per-user `identity_import/source` row retains
the plan digest, source digest and prepared/applied status; it never contains token
envelopes. Account subcommand journals retain encrypted tokens only while prepared,
then replace the command with a digest/outcome receipt.

1. Refuse a pre-existing account or published profile without this exact import
   intent. Conditionally claim the per-user import row. A different plan/source
   cannot take over it, including after completion.
2. Reserve the source provider ID, email and media prefix when present. Conflicts
   stop progress; prior partial reservations remain owned, without expiry/release.
3. Publish the verified, linked graph profile using an absent-head precondition.
4. Run the new operator `import` account command. It creates only an absent account,
   sets the original optional binding/token pair atomically in that account row,
   checks reservation ownership, and finishes its durable account receipt. It never
   updates an existing account. A bound account receives a fresh token revision,
   even when its source token pair is absent.
5. Compare every current reservation, account revision/binding/email/media/token
   value and graph profile revision/content against the plan. Mark the import
   applied, then verify again. Separate `verify(plan)` also requires an applied
   import receipt and checks current target state.

This is ordered, recoverable work across stores, not an atomic transaction. The
target must remain quiescent with application activation disabled. Graph publication
precedes the visible account binding, but target reads are not globally gated by
the import receipt. A process can stop between any two writes. Preserve its exact
plan and explicitly call `apply(plan)` again; uncertain failures never generate new
IDs, trigger automatic retries, release identifiers, erase records or restore old
state. Read failures propagate as well.

Suboperation receipts allow an interrupted import to discover already committed
work. They do not authorize restoring old tokens or profiles. If a later login or
profile update has advanced the account, replay/verification reports the mismatch
without overwriting it. A pending import with conflicting target state stays pending
for operator investigation; there is no automatic rollback or journal reclamation.

## Verification and recovery evidence

September 13 local Docker and Kubernetes dev synthetic contracts passed and their
exact fixture records were removed. The local restart-helper seed/verify passed
without restarting developer services. Typecheck, lint and focused unit tests also
passed. The CI workflow runs the same contract and the actual database restart
witness on the application PR.

The shared contract runs against in-memory stores and the existing real-store
`npm run cql:local -- identity-graph-test` fixture. It covers bound/unbound import,
original value equality, exact replay, changed plan/source refusal, existing target
refusal, identifier conflicts, concurrent resumes, interruption before and after
every composite write, and newer login/profile state during and after import.
Existing graph tests separately fault all physical owner/revision/edge writes.
Unit tests add unknown/invalid fields, bounds, BSON duplicate/truncated frames,
archive corruption, output privacy and pre-write plan validation.

The graph restart helper now also seeds an account import stopped after its account
receipt but before its import receipt. CI restarts the databases, then a fresh
process resumes with the saved plan, verifies current profile/account/token values
and removes the exact synthetic resources. Local seed/verify runs the same recovery
helper without restarting the developer stack. Private fixture manifests are
written before mutation and retained if cleanup fails; graph cleanup is sequential
to avoid shared edge-lock contention.

## Next work

Complete the target runtime write facet: provider-first/email-only account selection,
login/profile publication coordination, preference updates, media-prefix allocation,
and revision-aware provider revocation. Then add the environment-bound private bulk
manifest, full source/reference reconciliation and a maintenance-mode dev cutover
rehearsal. Runtime Gremlin authorization separation, availability boundaries,
campaign transaction replacement, retention/recovery, and separate dev/prod cutover
gates remain. No application backend switch or production schema change accompanies
this work.
