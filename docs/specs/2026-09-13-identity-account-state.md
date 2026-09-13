# Identity account state and token fencing

Draft PR #557 now includes inactive Cassandra-backed authentication state on top
of the reservation ledger. Application identity remains fixed to MongoDB. This
slice does not import accounts, issue sessions, call provider revocation endpoints,
write graph profiles, or deploy runtime database credentials.

## Authority and records

`createIdentityAccountState` owns operational authentication fields: a single
provider binding, exact email, immutable audio namespace and encrypted token pair.
Profiles, roles, preferences and campaign relationships are outside this payload;
they retain their existing authority until their graph/import contracts are ready.
A future graph copy of authentication fields must be a derived projection.

Two version-1 payloads use the existing `control_state` table; schema 0001 and
production schemas are unchanged:

| Record    | Key                                                      | Contents                                                                                                  |
| --------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Account   | `user:<legacy ID>` / `identity_account` / `auth`         | Provider binding, email, audio prefix, encrypted tokens, token revision, last operation ID                |
| Operation | `global` / `identity_account_operation` / operation UUID | Prepared immutable command, or terminal receipt containing command digest, user/operation IDs and outcome |

The operation UUID becomes the account's next row revision. Operation IDs are
never reused or expired; a repeat with another command/account fails. Receipt
updates use their own fresh UUID revisions. All writes use the existing Cassandra
CAS primitives and serial reconciliation reads, with no automatic retries. These
are [single-partition conditional operations](https://cassandra.apache.org/doc/stable/cassandra/architecture/guarantees.html),
not a transaction across the account and journal rows.

## Commands and preconditions

- `initialize` conditionally creates an **unbound** authentication record, with
  optional existing email/audio namespace and no tokens. Supplied identifiers
  must already be reserved for this account. It never overwrites an existing row.
  This is not a complete legacy-account importer: importing bound providers and
  original token envelopes still needs an explicit audited import operation.
- `login` requires an expected account revision and a reserved provider ID. An
  unbound account can acquire one binding; a bound account accepts only the same
  exact provider name and provider ID. Optional email updates require ownership
  of the new email reservation. Omitted email and the audio namespace survive.
  New encrypted token envelopes replace the pair and get a fresh token revision.
- `logout` requires the account revision, provider ID and token revision that the
  caller read. If any differs, the operation is rejected without clearing tokens.
  Success clears both access and refresh tokens and changes the token revision.

Every candidate account rechecks reservation ownership before mutation. Reservation
ownership alone does not establish who authenticated or authorize account selection.
The trusted future OAuth/import caller must enforce exact source-account matching
and choose the account ID. No browser may supply arbitrary commands or account IDs.
Old email reservations remain held; safe release/reassignment is still a cutover gate.

A conflicting expected revision is terminally rejected, not silently refreshed and
retried. A new intentional operation requires a new ID and a newly read snapshot.
This orders writes by account revision, not provider token issue timestamps. The
future OAuth orchestrator must capture its expected revision at the appropriate
point and must not turn delayed provider responses into fresh blind overwrites.

## Durable outcomes and interrupted writes

The protocol has three writes: persist the prepared command, conditionally write
the account, then conditionally record `applied` or `rejected` in the journal.
A thrown read/write error is uncertain, never a success signal. The caller retains
the command/UUID before `begin`; after interruption a new process calls `resume`
with that UUID. If initial intent insertion may not have arrived, explicitly repeat
`begin` with the same complete command first.

An account cannot advance until its last operation has an **applied receipt**.
Reads also refuse an account whose receipt is unfinished. This prevents a later
write from hiding an earlier committed revision before its outcome is durably
recorded. Recovery of a pending operation can therefore distinguish:

- Account revision equals its operation ID: the account committed; finish receipt.
- Expected prior revision is still current: attempt the same conditional write.
- Another revision is current: either this operation's applied receipt already
  exists (it committed and was superseded), or it lost the CAS and is rejected.

Concurrent resumes use the same immutable intent. A delayed worker cannot overwrite
a newer account or change a recorded outcome. A historical `applied` receipt says
only that the operation applied earlier; it is **not** proof of the current binding,
tokens, graph completion, or permission to mint a session. Consumers must reread
settled current state and validate the appropriate revision before proceeding.

Receipts and account rows must not be manually deleted, rewritten or expired.
Their preservation is necessary to prevent revision reuse and keep recovery
unambiguous. An operator recovery/retention workflow remains to be built before
application cutover; ordinary reads do not secretly perform recovery writes.

## Tokens and read boundaries

Token envelopes use the existing AES-256-GCM shape: canonical base64 ciphertext,
12-byte IV and 16-byte tag. The state layer validates shape; encryption/decryption
and key configuration remain with the existing token helper. Each ciphertext is
bounded to 4,096 base64 characters, and full prepared/account records must fit the
existing 16 KiB state limit. Exact identifier bounds match the reservation ledger.
The future importer must audit these bounds; no values are truncated or repaired.

`readAccount` is an internal operational snapshot and explicitly omits encrypted
tokens. It includes the private audio namespace and must not become a public DTO.
`readTokens` is the explicit sensitive read, returning both account/token revisions
with encrypted envelopes. Public profile repository results remain separately
whitelisted and Mongo-backed.

Prepared commands retain encrypted tokens for recovery. Terminal receipts remove
the command and retain its SHA-256 digest/outcome, avoiding logical accumulation of
historical token envelopes in receipts. This is not immediate physical erasure of
Cassandra storage versions or backups. Neither journal contents nor tokens belong
in logs, Git or CI artifacts.

These fences protect **stored token state**. Provider HTTP revocation is an external
side effect and may affect an entire grant; a database CAS cannot undo that request.
Provider-specific revocation ordering/recovery and wiring the new contract into
OAuth remain required. The current Mongo logout path is unchanged by this inactive
slice and still clears by provider ID.

## Verification

The same contract runs in unit tests and real Cassandra via `cql:test`, with exact
fixture-key manifests written before mutations and cleanup limited to those keys.
It covers competing provider bindings and account creation, eight concurrent
resumes, stale account and token revisions, historical replay after logout,
failures before/after all three writes for each command, unreceipted-account read
and advancement refusal, and a deliberately delayed CAS after subsequent logins.
It also checks missing reservations, malformed inputs, receipt privacy, read
failures, missing operations and inconsistent account IDs/revisions.

Local Docker and Kubernetes dev execute this contract using synthetic accounts
and token envelopes only. The CI restart witness now includes an account that
committed before its receipt was recorded. After the existing Cassandra/JanusGraph
restart, a new process refuses the unreceipted read, resumes by operation ID,
verifies settled state and removes its exact records. The local seed/verify helper
exercises that protocol without restarting the developer's running services.

The inactive [graph publication/read facet](2026-09-13-identity-graph-profiles.md)
now joins this account state to verified profile revisions. Runtime authorization,
full target write repository wiring,
source import (including bound accounts/tokens), availability separation, campaign
transaction replacement, safe reservation release and separate dev/prod cutovers
remain ahead.
