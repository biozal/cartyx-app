# Identity reservation preparation and recovery

This slice in draft PR #557 adds an inactive target-storage primitive for exact
provider IDs, emails and audio namespaces. It is exercised with real Cassandra
in local Docker, Kubernetes dev and CI. Application identity remains explicitly
Mongo-backed. There are no graph writes, user imports, runtime credentials added
to deployments or production schema changes.

## Durable records

`createIdentityReservations` accepts the existing conditional state store. It uses
two version-1 payloads in `control_state`, without changing schema 0001:

| Record              | Scope/type/ID                                                         | Payload                                                                            |
| ------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Preparation journal | `global` / `identity_reservation_operation` / caller-retained UUID v4 | Immutable intent: operation ID, canonical legacy user ID, requested claims; status |
| Identifier owner    | `global` / `identity_reservation` / SHA-256 of JSON `[kind, value]`   | Exact kind/value and canonical legacy user ID                                      |

Kinds are `provider_id`, `email`, and `audio_prefix`. Provider IDs and emails retain
exact casing and Unicode representation. They must be nonempty, losslessly UTF-8
encodable strings of at most 1,024 UTF-16 code units. Prefixes retain the existing
32 lowercase hexadecimal format. One intent contains one to three claims, at most
one per kind. The future importer must audit these bounds and handle unsupported
legacy values explicitly; this primitive does not claim full source compatibility.
Unknown properties, malformed IDs, duplicate kinds and unsupported record versions
fail with generic errors that do not include identity values.

Hashed keys bound partition-key size; they do **not** anonymize identities. The
protected payload retains the complete string and checks it on reads, so a hash
collision or corrupt row fails rather than resolving to another identity. No token
envelopes, provider credentials, graph relationships or arbitrary account payloads
belong in these records. Do not publish these payloads or manifests containing
source identifiers in logs, Git or CI artifacts.

## Operation protocol

1. The trusted caller generates and durably retains an operation UUID and the
   intended user/claims before calling `begin`. `begin` inserts the immutable
   intent in `preparing` state. Reusing the UUID with different values fails;
   changing input array order is harmless. It does not acquire identifiers.
2. `resume(operationId)` loads the durable intent and visits claims in fixed kind
   order. Each claim uses conditional create. An existing identical claim owned
   by the same user is reusable. A claim owned by another user causes `conflict`.
3. Once every claim is verified, a revision-conditional update changes the journal
   to `reserved`. A conflict similarly becomes terminal through CAS. Concurrent
   resumes of the same immutable intent converge on the same terminal result.
4. Any thrown read/write error stops the call. In particular, an acknowledgement
   lost after commit is **not** success. A fresh process explicitly resumes by the
   retained operation ID. If the initial journal insertion may not have arrived,
   explicitly repeat `begin` with the same ID and intent, then resume.

The current state primitives use LOCAL_QUORUM writes, LOCAL_SERIAL conditional
phases/reconciliation reads, and disable automatic retries/speculation. Cassandra
conditional updates provide single-partition CAS; they do not make the journal
and all identifier rows one transaction. See Apache's
[conditional DML](https://cassandra.apache.org/doc/latest/cassandra/developing/cql/dml.html)
and [consistency guarantees](https://cassandra.apache.org/doc/stable/cassandra/architecture/guarantees.html).

Recovery checks the complete immutable intent/ownership, not just the latest
revision: another resume may have completed the same operation. It does not claim
historical exactly-once execution. Every CAS uses a fresh revision, and identifier
ownership never changes through this API. A completed `resume` rechecks all claims
and fails if an owner or record has changed. A conflict stays terminal.

## Deliberate limits before account integration

`reserved` means only that these identifiers are reserved for that user ID. It is
not account existence, a valid provider binding, permission, completed login or a
safe point to mint a session. The trusted caller must select the account ID; this
API must never be exposed to a browser or arbitrary caller-selected account ID.
Different operations can reserve different provider IDs for the same account;
the [account state CAS](2026-09-13-identity-account-state.md) now enforces one
provider binding while remaining inactive.

Claims never expire, transfer or get deleted here. A conflict after an earlier
acquisition retains that earlier claim. This protects uniqueness under delayed
workers, but can strand identifiers. New-account abandonment, email changes,
account deletion and provider reassignment need a fenced release/reconciliation
protocol before cutover. Do not manually delete a reservation and let an old worker
resume. A fixed claim order does not promise that one whole multi-claim operation
always succeeds when requests overlap in different ways.

This journal covers reservation preparation only. The inactive
[account state protocol](2026-09-13-identity-account-state.md) adds account/token
revisions and durable outcome receipts. Source-account matching/import, provider
revocation orchestration and graph projection recovery remain. A reservation must never directly drive an unconditional mutable graph
write: a delayed worker could overwrite newer account state. Runtime Gremlin
permission separation and schema changes remain required before graph application
writes. Availability separation, campaign transaction replacement, importer and
separate dev/prod rehearsals/cutovers also remain open.

## Verification and recovery fixtures

`identityReservationContract` runs against the in-memory unit harness and real CQL
inside `npm run cql:test` / `npm run cql:local -- test`. It covers:

- Eight competing accounts for the same identifiers, with exactly one owner.
- Eight simultaneous resumes, stable same-owner reuse, changed-intent refusal.
- Failure before and after each of five writes: intent, three claims, terminal CAS.
- Lost conflict acknowledgement, read failure, partial conflict retention, and
  refusal to acquire a retained claim for another account.
- Exact casing, Unicode representation and kind separation; collision/corruption
  refusal and detection of changed ownership after completion.

Faults are injected at the real store boundary, including after a successful CQL
write while hiding its acknowledgement. These are controlled application-level
faults, not a claim to cover every network partition or database failure mode.
Each generated test key is recorded privately **before** mutation in
`.local/cql/runs/<random>.json`; cleanup deletes only those exact fixture records.
The journals and claims from these synthetic tests do not belong to real accounts.

The existing CI restart sequence now seeds both a generic revision witness and an
unfinished identity operation whose first claim committed before its response was
lost. A new process after Cassandra/JanusGraph restart verifies that claim survived,
resumes from the saved journal, verifies all owners and removes the exact witnesses.
`.local/cql/persistence.json` retains the keys/intent if interrupted. Never overwrite
an existing manifest to start a new test. Local seed/verify also exercises this
helper without restarting the developer's running databases; CI performs the actual
container restart.
